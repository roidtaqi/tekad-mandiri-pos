-- 000024_harden_costing_and_opname_authority.sql

-- Cost projection authority -------------------------------------------------

ALTER TABLE costing.product_cost_states
  ADD COLUMN cost_status TEXT NOT NULL DEFAULT 'FINAL',
  ADD COLUMN cost_source_type TEXT,
  ADD COLUMN cost_source_id UUID,
  ADD CONSTRAINT product_cost_states_status_check CHECK (
    cost_status IN ('PROVISIONAL', 'FINAL')
  ),
  ADD CONSTRAINT product_cost_states_source_pair_check CHECK (
    (cost_source_type IS NULL) = (cost_source_id IS NULL)
  );

UPDATE costing.product_cost_states state
SET cost_status = CASE
      WHEN event.event_type = 'PROVISIONAL_COST' THEN 'PROVISIONAL'
      ELSE 'FINAL'
    END,
    cost_source_type = event.source_type,
    cost_source_id = event.source_id
FROM costing.cost_events event
WHERE event.id = state.last_cost_event_id;

COMMENT ON COLUMN costing.product_cost_states.cost_status IS
  'Explicit authority status of the current valuation projection.';
COMMENT ON COLUMN costing.product_cost_states.cost_source_type IS
  'Type of the business fact currently supporting cost_status and MWA.';
COMMENT ON COLUMN costing.product_cost_states.cost_source_id IS
  'Identifier of the business fact currently supporting cost_status and MWA.';

-- Traceable COGS reconciliation roles --------------------------------------

ALTER TABLE costing.cogs_reconciliations
  ADD COLUMN reconciliation_role TEXT NOT NULL DEFAULT 'MANUAL_COST_RECONCILIATION',
  ADD COLUMN cost_status TEXT NOT NULL DEFAULT 'FINAL',
  ADD COLUMN source_purchase_item_id UUID REFERENCES purchasing.purchase_items(id),
  ADD COLUMN source_receipt_item_id UUID REFERENCES purchasing.receipt_items(id),
  ADD CONSTRAINT cogs_reconciliations_role_check CHECK (
    reconciliation_role IN (
      'MANUAL_COST_RECONCILIATION',
      'NEGATIVE_STOCK_REPLACEMENT_PROVISIONAL',
      'NEGATIVE_STOCK_REPLACEMENT_FINAL_DELTA'
    )
  ),
  ADD CONSTRAINT cogs_reconciliations_status_check CHECK (
    cost_status IN ('PROVISIONAL', 'FINAL')
  ),
  ADD CONSTRAINT cogs_reconciliations_quantity_check CHECK (quantity > 0);

CREATE UNIQUE INDEX cogs_reconciliations_receipt_role_key
ON costing.cogs_reconciliations (
  business_id, transaction_item_id, source_receipt_item_id, reconciliation_role
)
WHERE source_receipt_item_id IS NOT NULL;

CREATE TABLE costing.negative_stock_replacements (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  receipt_item_id UUID NOT NULL REFERENCES purchasing.receipt_items(id),
  purchase_item_id UUID NOT NULL REFERENCES purchasing.purchase_items(id),
  transaction_item_id UUID NOT NULL REFERENCES sales.transaction_items(id),
  quantity NUMERIC(20,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT negative_stock_replacements_pkey PRIMARY KEY (id),
  CONSTRAINT negative_stock_replacements_quantity_check CHECK (quantity > 0),
  CONSTRAINT negative_stock_replacements_receipt_sale_key
    UNIQUE (receipt_item_id, transaction_item_id)
);

CREATE INDEX negative_stock_replacements_purchase_item_idx
ON costing.negative_stock_replacements (business_id, location_id, purchase_item_id);

-- Authoritative inventory movement order and Opname watermark --------------

ALTER TABLE inventory.stock_movements
  ADD COLUMN ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY;

ALTER TABLE inventory.stock_movements
  ADD CONSTRAINT stock_movements_ledger_sequence_key UNIQUE (ledger_sequence);

ALTER TABLE inventory.opname_items
  ADD COLUMN count_movement_sequence BIGINT,
  ADD COLUMN count_movement_id UUID REFERENCES inventory.stock_movements(id),
  ADD COLUMN recount_trigger_sequence BIGINT,
  ADD COLUMN recount_trigger_movement_id UUID REFERENCES inventory.stock_movements(id),
  ADD CONSTRAINT opname_items_count_watermark_check CHECK (
    count_movement_sequence IS NULL OR count_movement_sequence >= 0
  ),
  ADD CONSTRAINT opname_items_recount_watermark_check CHECK (
    (recount_trigger_sequence IS NULL) = (recount_trigger_movement_id IS NULL)
  );

CREATE INDEX stock_movements_product_ledger_idx
ON inventory.stock_movements (
  business_id, location_id, product_id, ledger_sequence
);

CREATE OR REPLACE FUNCTION inventory.mark_counting_opname_recount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE inventory.opname_items item
  SET recount_recommended = TRUE,
      recount_trigger_sequence = NEW.ledger_sequence,
      recount_trigger_movement_id = NEW.id
  FROM inventory.opname_sessions session
  WHERE session.id = item.opname_session_id
    AND session.business_id = NEW.business_id
    AND session.location_id = NEW.location_id
    AND session.status = 'COUNTING'
    AND item.product_id = NEW.product_id
    AND item.counted_at IS NULL;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER stock_movement_marks_counting_opname_recount
AFTER INSERT ON inventory.stock_movements
FOR EACH ROW
EXECUTE FUNCTION inventory.mark_counting_opname_recount();

COMMENT ON COLUMN inventory.stock_movements.ledger_sequence IS
  'Database-assigned ordering authority used for local movement snapshots.';
COMMENT ON COLUMN inventory.opname_items.count_movement_sequence IS
  'Inclusive movement-ledger watermark used to derive system_qty_at_count.';
COMMENT ON COLUMN inventory.opname_items.recount_trigger_sequence IS
  'Movement observed while this item was unconfirmed in a COUNTING session.';
