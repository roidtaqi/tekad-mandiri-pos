-- Tenant-safe identity/device references and database-enforced append-only facts.

CREATE OR REPLACE FUNCTION identity.enforce_membership_role_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  membership_business_id UUID;
  role_business_id UUID;
  role_status TEXT;
BEGIN
  SELECT business_id
  INTO membership_business_id
  FROM identity.business_memberships
  WHERE id = NEW.membership_id;

  SELECT business_id, status
  INTO role_business_id, role_status
  FROM identity.roles
  WHERE id = NEW.role_id;

  IF membership_business_id IS NULL OR role_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Membership and role must exist before assignment.';
  END IF;

  IF role_status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Inactive roles cannot be assigned.';
  END IF;

  IF role_business_id IS NOT NULL AND role_business_id <> membership_business_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'A business-scoped role cannot be assigned across Businesses.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER membership_roles_enforce_scope
BEFORE INSERT OR UPDATE OF membership_id, role_id
ON identity.membership_roles
FOR EACH ROW
EXECUTE FUNCTION identity.enforce_membership_role_scope();

ALTER TABLE identity.devices
  ADD CONSTRAINT devices_id_business_id_key UNIQUE (id, business_id);

ALTER TABLE identity.sessions
  DROP CONSTRAINT sessions_device_id_fkey,
  ADD CONSTRAINT sessions_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE sync.device_sync_states
  DROP CONSTRAINT device_sync_states_device_id_fkey,
  ADD CONSTRAINT device_sync_states_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE sync.conflicts
  DROP CONSTRAINT conflicts_device_id_fkey,
  ADD CONSTRAINT conflicts_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE sales.transactions
  DROP CONSTRAINT transactions_device_id_fkey,
  ADD CONSTRAINT transactions_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE sales.payments
  DROP CONSTRAINT payments_device_id_fkey,
  ADD CONSTRAINT payments_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE audit.audit_events
  DROP CONSTRAINT audit_events_device_id_fkey,
  ADD CONSTRAINT audit_events_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE cash.cash_movements
  DROP CONSTRAINT cash_movements_device_id_fkey,
  ADD CONSTRAINT cash_movements_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE inventory.stock_movements
  ADD CONSTRAINT stock_movements_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE returns.customer_returns
  DROP CONSTRAINT customer_returns_device_id_fkey,
  ADD CONSTRAINT customer_returns_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

ALTER TABLE returns.refunds
  DROP CONSTRAINT refunds_device_id_fkey,
  ADD CONSTRAINT refunds_device_business_fkey
    FOREIGN KEY (device_id, business_id)
    REFERENCES identity.devices(id, business_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION core.reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%I.%I is append-only; corrections require a new domain event.', TG_TABLE_SCHEMA, TG_TABLE_NAME);
END;
$function$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.audit_events
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON inventory.stock_movements
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER cash_movements_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON cash.cash_movements
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER cost_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON costing.cost_events
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER cogs_reconciliations_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON costing.cogs_reconciliations
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER transaction_items_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON sales.transaction_items
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();

CREATE TRIGGER shift_closing_snapshots_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON cash.shift_closing_snapshots
FOR EACH STATEMENT
EXECUTE FUNCTION core.reject_append_only_mutation();
