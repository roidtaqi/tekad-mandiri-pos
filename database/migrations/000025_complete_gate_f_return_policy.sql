-- Gate F: authoritative Return policy, override snapshots, and derived Refund summary.

CREATE UNIQUE INDEX locations_business_id_id_key
ON core.locations (business_id, id);

CREATE TABLE core.business_settings (
  business_id UUID NOT NULL PRIMARY KEY
    REFERENCES core.businesses(id) ON DELETE RESTRICT,
  default_location_id UUID NOT NULL,
  negative_stock_allowed BOOLEAN NOT NULL DEFAULT false,
  return_window_days INTEGER NOT NULL DEFAULT 7,
  allow_no_receipt_return BOOLEAN NOT NULL DEFAULT false,
  high_value_return_threshold NUMERIC(20,4),
  high_value_adjustment_threshold NUMERIC(20,4),
  trusted_clock_max_drift_seconds INTEGER NOT NULL DEFAULT 300,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version BIGINT NOT NULL DEFAULT 1,

  CONSTRAINT business_settings_default_location_fkey
    FOREIGN KEY (business_id, default_location_id)
    REFERENCES core.locations(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT business_settings_return_window_check CHECK (return_window_days >= 0),
  CONSTRAINT business_settings_thresholds_check CHECK (
    (high_value_return_threshold IS NULL OR high_value_return_threshold >= 0)
    AND (
      high_value_adjustment_threshold IS NULL
      OR high_value_adjustment_threshold >= 0
    )
  ),
  CONSTRAINT business_settings_clock_drift_check CHECK (
    trusted_clock_max_drift_seconds >= 0
  ),
  CONSTRAINT business_settings_version_check CHECK (version > 0)
);

INSERT INTO core.business_settings (business_id, default_location_id)
SELECT b.id, l.id
FROM core.businesses b
JOIN core.locations l ON l.business_id = b.id AND l.is_default
ON CONFLICT (business_id) DO NOTHING;

CREATE TABLE returns.return_reason_policies (
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  reason_code TEXT NOT NULL,
  normal_disposition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version BIGINT NOT NULL DEFAULT 1,

  CONSTRAINT return_reason_policies_pkey PRIMARY KEY (business_id, reason_code),
  CONSTRAINT return_reason_policies_reason_check CHECK (btrim(reason_code) <> ''),
  CONSTRAINT return_reason_policies_disposition_check CHECK (
    normal_disposition IN ('RESTOCK', 'NOT_RESTOCKED')
  ),
  CONSTRAINT return_reason_policies_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT return_reason_policies_version_check CHECK (version > 0)
);

-- D09 explicitly locks these two reason defaults. Other reason mappings remain
-- an explicit per-Business policy instead of being guessed by application code.
INSERT INTO returns.return_reason_policies (
  business_id, reason_code, normal_disposition
)
SELECT b.id, policy.reason_code, policy.normal_disposition
FROM core.businesses b
CROSS JOIN (
  VALUES
    ('DAMAGED', 'NOT_RESTOCKED'),
    ('EXPIRED', 'NOT_RESTOCKED')
) AS policy(reason_code, normal_disposition)
ON CONFLICT (business_id, reason_code) DO NOTHING;

CREATE OR REPLACE FUNCTION core.initialize_business_operational_defaults_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default THEN
    INSERT INTO core.business_settings (business_id, default_location_id)
    VALUES (NEW.business_id, NEW.id)
    ON CONFLICT (business_id) DO NOTHING;

    INSERT INTO returns.return_reason_policies (
      business_id, reason_code, normal_disposition
    ) VALUES
      (NEW.business_id, 'DAMAGED', 'NOT_RESTOCKED'),
      (NEW.business_id, 'EXPIRED', 'NOT_RESTOCKED')
    ON CONFLICT (business_id, reason_code) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER locations_initialize_business_operational_defaults
AFTER INSERT OR UPDATE OF is_default
ON core.locations
FOR EACH ROW
EXECUTE FUNCTION core.initialize_business_operational_defaults_trigger();

ALTER TABLE returns.customer_returns
  ADD COLUMN return_window_days_snapshot INTEGER,
  ADD COLUMN return_age_days INTEGER,
  ADD COLUMN window_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN window_override_reason TEXT;

UPDATE returns.customer_returns
SET return_window_days_snapshot = 7,
    return_age_days = 0
WHERE return_window_days_snapshot IS NULL OR return_age_days IS NULL;

ALTER TABLE returns.customer_returns
  ALTER COLUMN return_window_days_snapshot SET NOT NULL,
  ALTER COLUMN return_age_days SET NOT NULL,
  ADD CONSTRAINT customer_returns_window_snapshot_check CHECK (
    return_window_days_snapshot >= 0 AND return_age_days >= 0
  ),
  ADD CONSTRAINT customer_returns_window_override_reason_check CHECK (
    (NOT window_override AND window_override_reason IS NULL)
    OR (window_override AND btrim(window_override_reason) <> '')
  );

ALTER TABLE returns.return_items
  ADD COLUMN normal_disposition_snapshot TEXT,
  ADD COLUMN disposition_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN disposition_override_reason TEXT;

UPDATE returns.return_items
SET normal_disposition_snapshot = disposition
WHERE normal_disposition_snapshot IS NULL;

ALTER TABLE returns.return_items
  ALTER COLUMN normal_disposition_snapshot SET NOT NULL,
  ADD CONSTRAINT return_items_normal_disposition_check CHECK (
    normal_disposition_snapshot IN ('RESTOCK', 'NOT_RESTOCKED')
  ),
  ADD CONSTRAINT return_items_disposition_override_check CHECK (
    (
      NOT disposition_override
      AND disposition = normal_disposition_snapshot
      AND disposition_override_reason IS NULL
    )
    OR (
      disposition_override
      AND disposition <> normal_disposition_snapshot
      AND btrim(disposition_override_reason) <> ''
    )
  ),
  ADD CONSTRAINT return_items_loss_category_check CHECK (
    return_loss_category IS NULL
    OR return_loss_category IN (
      'DAMAGED_RETURN', 'EXPIRED_RETURN', 'QUALITY_RETURN',
      'GOODWILL_REFUND', 'CUSTOMER_DAMAGE', 'OTHER_RETURN_LOSS'
    )
  );

CREATE INDEX return_items_original_line_idx
ON returns.return_items (original_transaction_item_id)
WHERE original_transaction_item_id IS NOT NULL;

CREATE INDEX refunds_original_payment_status_idx
ON returns.refunds (original_payment_id, status)
WHERE original_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION returns.refresh_customer_return_refund_summary(
  target_return_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  completed_total NUMERIC(20,4);
  active_refund_count BIGINT;
  return_value NUMERIC(20,4);
BEGIN
  SELECT
    cr.return_total,
    COALESCE(sum(r.amount) FILTER (WHERE r.status = 'COMPLETED'), 0),
    count(r.id) FILTER (WHERE r.status <> 'REVERSED')
  INTO return_value, completed_total, active_refund_count
  FROM returns.customer_returns cr
  LEFT JOIN returns.refunds r ON r.customer_return_id = cr.id
  WHERE cr.id = target_return_id
  GROUP BY cr.return_total;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE returns.customer_returns
  SET refunded_total = completed_total,
      refund_status = CASE
        WHEN active_refund_count = 0 THEN 'NONE'
        WHEN completed_total >= return_value THEN 'COMPLETED'
        WHEN completed_total > 0 THEN 'PARTIAL'
        ELSE 'PENDING'
      END
  WHERE id = target_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION returns.refresh_customer_return_refund_summary_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM returns.refresh_customer_return_refund_summary(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.customer_return_id ELSE NEW.customer_return_id END
  );
  IF TG_OP = 'UPDATE' AND OLD.customer_return_id <> NEW.customer_return_id THEN
    PERFORM returns.refresh_customer_return_refund_summary(OLD.customer_return_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER refunds_refresh_customer_return_summary
AFTER INSERT OR UPDATE OF amount, status, customer_return_id OR DELETE
ON returns.refunds
FOR EACH ROW
EXECUTE FUNCTION returns.refresh_customer_return_refund_summary_trigger();
