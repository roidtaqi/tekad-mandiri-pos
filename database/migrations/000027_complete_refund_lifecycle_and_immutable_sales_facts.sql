-- Gate F: explicit Refund lifecycle events and immutable completed-sale/Return facts.

ALTER TABLE returns.customer_returns
  ADD CONSTRAINT customer_returns_id_business_location_key
    UNIQUE (id, business_id, location_id);

ALTER TABLE returns.refunds
  ADD CONSTRAINT refunds_id_business_return_location_key
    UNIQUE (id, business_id, customer_return_id, location_id);

ALTER TABLE cash.cash_movements
  ADD CONSTRAINT cash_movements_id_business_location_key
    UNIQUE (id, business_id, location_id);

CREATE TABLE returns.refund_lifecycle_events (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES core.locations(id) ON DELETE RESTRICT,
  customer_return_id UUID NOT NULL,
  refund_id UUID NOT NULL,
  command_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  prior_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  external_reference TEXT,
  cash_movement_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  device_id UUID,
  correlation_id UUID NOT NULL,

  CONSTRAINT refund_lifecycle_events_command_key UNIQUE (business_id, command_id),
  CONSTRAINT refund_lifecycle_events_return_scope_fkey
    FOREIGN KEY (customer_return_id, business_id, location_id)
    REFERENCES returns.customer_returns(id, business_id, location_id)
    ON DELETE RESTRICT,
  CONSTRAINT refund_lifecycle_events_refund_scope_fkey
    FOREIGN KEY (refund_id, business_id, customer_return_id, location_id)
    REFERENCES returns.refunds(id, business_id, customer_return_id, location_id)
    ON DELETE RESTRICT,
  CONSTRAINT refund_lifecycle_events_cash_scope_fkey
    FOREIGN KEY (cash_movement_id, business_id, location_id)
    REFERENCES cash.cash_movements(id, business_id, location_id)
    ON DELETE RESTRICT,
  CONSTRAINT refund_lifecycle_events_device_scope_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id)
    ON DELETE RESTRICT,
  CONSTRAINT refund_lifecycle_events_type_check CHECK (
    event_type IN (
      'RETRY_REQUESTED',
      'RESOLVED_COMPLETED',
      'RESOLVED_FAILED',
      'RESOLVED_REQUIRES_ACTION',
      'REVERSED'
    )
  ),
  CONSTRAINT refund_lifecycle_events_prior_status_check CHECK (
    prior_status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'REQUIRES_ACTION')
  ),
  CONSTRAINT refund_lifecycle_events_new_status_check CHECK (
    new_status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'REQUIRES_ACTION')
  ),
  CONSTRAINT refund_lifecycle_events_reason_check CHECK (btrim(reason) <> '')
);

CREATE INDEX refund_lifecycle_events_refund_idx
ON returns.refund_lifecycle_events (refund_id, occurred_at, id);

CREATE INDEX refunds_outstanding_idx
ON returns.refunds (business_id, status, requested_at, id)
WHERE status IN ('PENDING', 'FAILED', 'REQUIRES_ACTION');

CREATE UNIQUE INDEX refunds_external_reference_key
ON returns.refunds (business_id, external_reference)
WHERE external_reference IS NOT NULL;

CREATE TRIGGER refund_lifecycle_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON returns.refund_lifecycle_events
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER transactions_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON sales.transactions
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER payments_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON sales.payments
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER return_items_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON returns.return_items
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE OR REPLACE FUNCTION returns.enforce_customer_return_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    to_jsonb(NEW) - ARRAY['refunded_total', 'refund_status']
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY['refunded_total', 'refund_status']
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'returns.customer_returns business facts are immutable; corrections require a new domain event.';
  END IF;

  -- Derived summary columns may only be refreshed by the nested Refund trigger.
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'returns.customer_returns refund summary is derived from Refund lifecycle facts.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER customer_returns_immutable_update
BEFORE UPDATE ON returns.customer_returns
FOR EACH ROW
EXECUTE FUNCTION returns.enforce_customer_return_immutability();

CREATE TRIGGER customer_returns_no_delete
BEFORE DELETE OR TRUNCATE ON returns.customer_returns
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE OR REPLACE FUNCTION returns.enforce_refund_lifecycle_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    to_jsonb(NEW) - ARRAY[
      'status', 'processor_reference', 'processed_at', 'processed_by',
      'external_reference', 'completed_at', 'failed_at', 'version'
    ]
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'status', 'processor_reference', 'processed_at', 'processed_by',
      'external_reference', 'completed_at', 'failed_at', 'version'
    ]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'returns.refunds identity and economic facts are immutable.';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Refund lifecycle transition must increment version exactly once.';
  END IF;

  IF NOT (
    (OLD.status = 'PENDING' AND NEW.status IN ('COMPLETED', 'FAILED', 'REQUIRES_ACTION'))
    OR (OLD.status = 'FAILED' AND NEW.status IN ('PENDING', 'COMPLETED', 'REQUIRES_ACTION'))
    OR (OLD.status = 'REQUIRES_ACTION' AND NEW.status IN ('PENDING', 'COMPLETED', 'FAILED'))
    OR (OLD.status = 'COMPLETED' AND NEW.status = 'REVERSED')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('Invalid Refund lifecycle transition: %s to %s.', OLD.status, NEW.status);
  END IF;

  IF NEW.processed_at IS NULL OR NEW.processed_by IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Refund lifecycle transition requires processor attribution and timestamp.';
  END IF;

  IF NEW.status = 'COMPLETED' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Completed Refund requires completed_at.';
  END IF;

  IF NEW.status = 'FAILED' AND NEW.failed_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Failed Refund requires failed_at.';
  END IF;

  IF NEW.status IN ('PENDING', 'REQUIRES_ACTION')
     AND (NEW.completed_at IS NOT NULL OR NEW.failed_at IS NOT NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Unsettled Refund cannot carry completed_at or failed_at.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER refunds_lifecycle_only_update
BEFORE UPDATE ON returns.refunds
FOR EACH ROW
EXECUTE FUNCTION returns.enforce_refund_lifecycle_update();

CREATE OR REPLACE FUNCTION returns.require_refund_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  lifecycle_event returns.refund_lifecycle_events%ROWTYPE;
  refund_is_cash BOOLEAN;
  cash_effect cash.cash_movements%ROWTYPE;
BEGIN
  SELECT e.*
  INTO lifecycle_event
  FROM returns.refund_lifecycle_events e
  WHERE e.refund_id = NEW.id
    AND e.business_id = NEW.business_id
    AND e.customer_return_id = NEW.customer_return_id
    AND e.location_id = NEW.location_id
    AND e.prior_status = OLD.status
    AND e.new_status = NEW.status
    AND e.occurred_at = NEW.processed_at
    AND e.actor_user_id = NEW.processed_by
    AND e.external_reference IS NOT DISTINCT FROM NEW.external_reference
    AND e.event_type = CASE NEW.status
      WHEN 'PENDING' THEN 'RETRY_REQUESTED'
      WHEN 'COMPLETED' THEN 'RESOLVED_COMPLETED'
      WHEN 'FAILED' THEN 'RESOLVED_FAILED'
      WHEN 'REQUIRES_ACTION' THEN 'RESOLVED_REQUIRES_ACTION'
      WHEN 'REVERSED' THEN 'REVERSED'
    END
  LIMIT 1;

  IF lifecycle_event.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Refund lifecycle transition requires its append-only lifecycle event in the same transaction.';
  END IF;

  SELECT pm.is_cash
  INTO refund_is_cash
  FROM sales.payment_methods pm
  WHERE pm.id = NEW.payment_method_id
    AND pm.business_id = NEW.business_id;

  IF refund_is_cash AND NEW.status IN ('COMPLETED', 'REVERSED') THEN
    IF lifecycle_event.cash_movement_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Cash Refund completion or reversal requires its Cash Movement in the same transaction.';
    END IF;

    SELECT cm.*
    INTO cash_effect
    FROM cash.cash_movements cm
    WHERE cm.id = lifecycle_event.cash_movement_id
      AND cm.business_id = NEW.business_id
      AND cm.location_id = NEW.location_id;

    IF cash_effect.id IS NULL
       OR cash_effect.amount <> NEW.amount
       OR (
         NEW.status = 'COMPLETED'
         AND NOT (
           cash_effect.movement_type = 'CASH_REFUND'
           AND cash_effect.direction = 'OUT'
           AND cash_effect.source_type = 'CUSTOMER_REFUND'
           AND cash_effect.source_id = NEW.id
         )
       )
       OR (
         NEW.status = 'REVERSED'
         AND NOT (
           cash_effect.movement_type = 'CASH_REVERSAL'
           AND cash_effect.direction = 'IN'
           AND cash_effect.source_type = 'REFUND_REVERSAL'
           AND cash_effect.source_id = lifecycle_event.id
         )
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Cash Refund lifecycle event does not reference the required authoritative Cash Movement.';
    END IF;
  ELSIF lifecycle_event.cash_movement_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'This Refund lifecycle transition must not carry a Cash Movement.';
  END IF;

  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER refunds_lifecycle_event_required
AFTER UPDATE ON returns.refunds
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION returns.require_refund_lifecycle_event();

CREATE TRIGGER refunds_no_delete
BEFORE DELETE OR TRUNCATE ON returns.refunds
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();
