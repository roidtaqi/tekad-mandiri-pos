ALTER TABLE sales.transaction_items
  ADD COLUMN pricing_resolved_at_snapshot TIMESTAMPTZ,
  ADD COLUMN pricing_time_status_snapshot TEXT;

-- This one-time immutable-snapshot backfill must run before append-only
-- protection is restored. PostgreSQL executes the whole migration atomically,
-- so no application request can observe the guard as absent.
DROP TRIGGER transaction_items_append_only ON sales.transaction_items;

UPDATE sales.transaction_items
SET pricing_resolved_at_snapshot = created_at,
    pricing_time_status_snapshot = 'TRUSTED';

CREATE TRIGGER transaction_items_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON sales.transaction_items
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

ALTER TABLE sales.transaction_items
  ALTER COLUMN pricing_resolved_at_snapshot SET NOT NULL,
  ALTER COLUMN pricing_time_status_snapshot SET NOT NULL,
  ADD CONSTRAINT transaction_items_pricing_time_status_snapshot_check CHECK (
    pricing_time_status_snapshot IN ('TRUSTED', 'CLOCK_UNTRUSTED')
  );

COMMENT ON COLUMN sales.transaction_items.pricing_resolved_at_snapshot IS
  'Immutable time at which the cashier last explicitly resolved this line price.';

COMMENT ON COLUMN sales.transaction_items.pricing_time_status_snapshot IS
  'Trusted-clock state used by the deterministic offline pricing resolver.';
