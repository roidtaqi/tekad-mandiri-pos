-- M5-M9 operational domain integrity.
--
-- This migration completes database-level invariants that are shared by the
-- Purchasing, Costing, Pricing, Inventory, Return, and Refund command paths.

-- Purchasing ---------------------------------------------------------------

ALTER TABLE purchasing.purchases
  ADD CONSTRAINT purchases_status_check CHECK (
    status IN (
      'DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED',
      'READY_TO_POST', 'POSTED', 'CANCELLED'
    )
  ),
  ADD CONSTRAINT purchases_integrity_status_check CHECK (
    integrity_status IN ('CLEAR', 'WARNING', 'REVIEW_REQUIRED', 'DISPUTED', 'RESOLVED')
  ),
  ADD CONSTRAINT purchases_payment_status_check CHECK (
    payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')
  ),
  ADD CONSTRAINT purchases_version_check CHECK (version > 0);

CREATE INDEX purchases_supplier_invoice_duplicate_aid_idx
ON purchasing.purchases (business_id, supplier_id, supplier_invoice_number)
WHERE supplier_invoice_number IS NOT NULL;

ALTER TABLE purchasing.purchase_items
  ADD CONSTRAINT purchase_items_conversion_check CHECK (conversion_snapshot > 0),
  ADD CONSTRAINT purchase_items_expected_qty_check CHECK (expected_qty > 0),
  ADD CONSTRAINT purchase_items_amounts_check CHECK (
    (agreed_unit_price IS NULL OR agreed_unit_price >= 0)
    AND agreed_discount_amount >= 0
    AND agreed_free_qty >= 0
    AND (invoice_unit_price IS NULL OR invoice_unit_price >= 0)
    AND invoice_discount_amount >= 0
    AND invoice_free_qty >= 0
    AND (final_landed_cost_per_base_unit IS NULL OR final_landed_cost_per_base_unit >= 0)
  );

ALTER TABLE purchasing.receipt_items
  ADD CONSTRAINT receipt_items_conversion_check CHECK (conversion_snapshot > 0),
  ADD CONSTRAINT receipt_items_free_qty_check CHECK (free_qty_received >= 0),
  ADD CONSTRAINT receipt_items_base_qty_check CHECK (
    base_qty_accepted = accepted_qty * conversion_snapshot
  );

ALTER TABLE purchasing.purchase_invoices
  ADD CONSTRAINT purchase_invoices_amounts_check CHECK (
    subtotal >= 0
    AND item_discount_total >= 0
    AND global_discount_total >= 0
    AND tax_total >= 0
    AND acquisition_charge_total >= 0
    AND grand_total >= 0
  ),
  ADD CONSTRAINT purchase_invoices_version_check CHECK (version > 0);

ALTER TABLE purchasing.purchase_invoice_items
  ADD CONSTRAINT purchase_invoice_items_amounts_check CHECK (
    invoiced_qty > 0
    AND unit_price >= 0
    AND item_discount_amount >= 0
    AND tax_amount >= 0
    AND free_qty >= 0
  );

ALTER TABLE purchasing.purchase_charges
  ADD CONSTRAINT purchase_charges_type_check CHECK (
    type IN ('FREIGHT', 'HANDLING', 'NON_RECOVERABLE_TAX', 'OTHER_DIRECT_ACQUISITION')
  ),
  ADD CONSTRAINT purchase_charges_allocation_check CHECK (
    allocation_method IN ('BY_ITEM_VALUE', 'BY_QUANTITY', 'BY_WEIGHT', 'MANUAL')
  ),
  ADD CONSTRAINT purchase_charges_amount_check CHECK (amount >= 0);

ALTER TABLE purchasing.purchase_payments
  ADD CONSTRAINT purchase_payments_amount_check CHECK (amount > 0);

-- Costing ------------------------------------------------------------------

CREATE UNIQUE INDEX cost_events_business_source_role_key
ON costing.cost_events (
  business_id, location_id, product_id, source_type, source_id, event_type
);

ALTER TABLE costing.cost_events
  ADD CONSTRAINT cost_events_values_check CHECK (
    (quantity_basis IS NULL OR quantity_basis >= 0)
    AND (unit_cost_before IS NULL OR unit_cost_before >= 0)
    AND (unit_cost_after IS NULL OR unit_cost_after >= 0)
  );

ALTER TABLE costing.product_cost_states
  ADD CONSTRAINT product_cost_states_values_check CHECK (
    (mwa_unit_cost IS NULL OR mwa_unit_cost >= 0)
    AND (last_valid_mwa_unit_cost IS NULL OR last_valid_mwa_unit_cost >= 0)
    AND (latest_landed_unit_cost IS NULL OR latest_landed_unit_cost >= 0)
    AND (pricing_reference_unit_cost IS NULL OR pricing_reference_unit_cost >= 0)
  );

ALTER TABLE costing.cogs_reconciliations
  ADD CONSTRAINT cogs_reconciliations_values_check CHECK (
    (original_cost_snapshot IS NULL OR original_cost_snapshot >= 0)
    AND final_unit_cost >= 0
    AND quantity > 0
  );

-- Pricing ------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE pricing.margin_rules
  ADD CONSTRAINT margin_rules_rounding_rule_check CHECK (
    rounding_rule IN (
      'NONE', 'NEAREST_100', 'UP_TO_100', 'NEAREST_500',
      'UP_TO_500', 'NEAREST_1000', 'UP_TO_1000'
    )
  ),
  ADD CONSTRAINT margin_rules_values_check CHECK (
    target_margin >= 0 AND minimum_margin >= 0
  ),
  ADD CONSTRAINT margin_rules_version_check CHECK (version > 0);

ALTER TABLE pricing.price_sets
  ADD CONSTRAINT price_sets_status_check CHECK (
    status IN (
      'DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED',
      'ACTIVE', 'SUPERSEDED', 'REJECTED', 'CANCELLED'
    )
  ),
  ADD CONSTRAINT price_sets_version_check CHECK (version > 0);

ALTER TABLE pricing.price_proposal_items
  ADD CONSTRAINT price_proposal_items_price_check CHECK (
    proposed_price >= 0
    AND (current_price_snapshot IS NULL OR current_price_snapshot >= 0)
    AND (recommended_price IS NULL OR recommended_price >= 0)
    AND (final_approved_price IS NULL OR final_approved_price >= 0)
    AND (pricing_reference_cost_snapshot IS NULL OR pricing_reference_cost_snapshot >= 0)
  ),
  ADD CONSTRAINT price_proposal_items_set_unit_key UNIQUE (price_set_id, product_unit_id);

ALTER TABLE pricing.price_versions
  ADD CONSTRAINT price_versions_no_overlapping_publication
  EXCLUDE USING gist (
    business_id WITH =,
    product_unit_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'ACTIVE'));

ALTER TABLE pricing.promotions
  ADD CONSTRAINT promotions_type_check CHECK (
    promotion_type IN ('FIXED_PRICE', 'PERCENT_DISCOUNT', 'FIXED_DISCOUNT')
  ),
  ADD CONSTRAINT promotions_values_check CHECK (
    value >= 0 AND min_qty > 0 AND effective_to > effective_from AND version > 0
  );

-- Inventory ----------------------------------------------------------------

ALTER TABLE inventory.stock_movements
  DROP CONSTRAINT stock_movements_source_unique;

CREATE UNIQUE INDEX stock_movements_source_role_key
ON inventory.stock_movements (
  business_id, source_type, source_id, source_line_id, movement_type
) NULLS NOT DISTINCT;

ALTER TABLE inventory.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (
    movement_type IN (
      'INITIAL_STOCK', 'PURCHASE_RECEIPT', 'SUPPLIER_REPLACEMENT', 'SALE',
      'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'STOCK_ADJUSTMENT_IN',
      'STOCK_ADJUSTMENT_OUT', 'OPNAME_ADJUSTMENT_IN',
      'OPNAME_ADJUSTMENT_OUT', 'REVERSAL'
    )
  ),
  ADD CONSTRAINT stock_movements_delta_check CHECK (base_quantity_delta <> 0),
  ADD CONSTRAINT stock_movements_conversion_check CHECK (
    conversion_snapshot IS NULL OR conversion_snapshot > 0
  );

ALTER TABLE inventory.stock_adjustments
  ADD CONSTRAINT stock_adjustments_number_key UNIQUE (business_id, adjustment_number),
  ADD CONSTRAINT stock_adjustments_direction_check CHECK (direction IN ('IN', 'OUT')),
  ADD CONSTRAINT stock_adjustments_reason_check CHECK (
    reason_code IN ('DAMAGED', 'LOST', 'FOUND', 'DATA_CORRECTION', 'EXPIRED', 'OTHER')
  );

ALTER TABLE inventory.stock_adjustment_items
  ADD CONSTRAINT stock_adjustment_items_values_check CHECK (
    qty > 0
    AND conversion_snapshot > 0
    AND base_qty > 0
    AND (cost_snapshot IS NULL OR cost_snapshot >= 0)
  );

ALTER TABLE inventory.opname_sessions
  ADD CONSTRAINT opname_sessions_number_key UNIQUE (business_id, opname_number),
  ADD CONSTRAINT opname_sessions_status_check CHECK (
    status IN ('DRAFT', 'COUNTING', 'REVIEW', 'POSTED', 'CANCELLED')
  ),
  ADD CONSTRAINT opname_sessions_version_check CHECK (version > 0);

ALTER TABLE inventory.opname_items
  ADD CONSTRAINT opname_items_revision_check CHECK (count_revision >= 0),
  ADD CONSTRAINT opname_items_variance_check CHECK (
    physical_qty IS NULL
    OR system_qty_at_count IS NULL
    OR variance_qty = physical_qty - system_qty_at_count
  );

-- Returns and refunds -------------------------------------------------------

ALTER TABLE returns.customer_returns
  ALTER COLUMN original_transaction_id DROP NOT NULL,
  ADD COLUMN return_type TEXT NOT NULL DEFAULT 'PARTIAL',
  ADD COLUMN receipt_mode TEXT NOT NULL DEFAULT 'TRANSACTION_LINKED',
  ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN reason_summary TEXT,
  ADD COLUMN processed_by UUID REFERENCES identity.users(id) ON DELETE RESTRICT,
  ADD COLUMN shift_id UUID REFERENCES cash.shifts(id) ON DELETE RESTRICT,
  ADD COLUMN terminal_id UUID REFERENCES core.terminals(id) ON DELETE RESTRICT,
  ADD COLUMN device_id UUID REFERENCES identity.devices(id) ON DELETE RESTRICT,
  ADD COLUMN occurred_at TIMESTAMPTZ,
  ADD COLUMN correlation_id UUID;

UPDATE returns.customer_returns
SET processed_by = created_by,
    occurred_at = created_at,
    correlation_id = id,
    reason_summary = COALESCE(reason_summary, notes)
WHERE processed_by IS NULL OR occurred_at IS NULL OR correlation_id IS NULL;

ALTER TABLE returns.customer_returns
  ALTER COLUMN processed_by SET NOT NULL,
  ALTER COLUMN occurred_at SET NOT NULL,
  ALTER COLUMN correlation_id SET NOT NULL,
  ADD CONSTRAINT customer_returns_type_check CHECK (
    return_type IN ('PARTIAL', 'FULL', 'NO_RECEIPT')
  ),
  ADD CONSTRAINT customer_returns_status_check CHECK (
    status IN ('DRAFT', 'PENDING_CONFIRMATION', 'COMPLETED', 'REJECTED', 'CANCELLED')
  ),
  ADD CONSTRAINT customer_returns_receipt_mode_check CHECK (
    receipt_mode IN ('TRANSACTION_LINKED', 'NO_RECEIPT')
  ),
  ADD CONSTRAINT customer_returns_receipt_link_check CHECK (
    (receipt_mode = 'TRANSACTION_LINKED' AND original_transaction_id IS NOT NULL)
    OR (receipt_mode = 'NO_RECEIPT' AND return_type = 'NO_RECEIPT')
  ),
  ADD CONSTRAINT customer_returns_refund_status_check CHECK (
    refund_status IN ('NONE', 'PENDING', 'PARTIAL', 'COMPLETED')
  ),
  ADD CONSTRAINT customer_returns_amounts_check CHECK (
    return_total >= 0 AND refunded_total >= 0 AND refunded_total <= return_total
  ),
  ADD CONSTRAINT customer_returns_version_check CHECK (version > 0);

ALTER TABLE returns.return_items
  ALTER COLUMN original_transaction_item_id DROP NOT NULL,
  ADD COLUMN product_name_snapshot TEXT,
  ADD COLUMN unit_name_snapshot TEXT,
  ADD COLUMN conversion_snapshot NUMERIC(20,8),
  ADD COLUMN original_effective_unit_price NUMERIC(20,4),
  ADD COLUMN original_cost_unit_snapshot NUMERIC(24,8),
  ADD COLUMN return_loss_category TEXT,
  ADD COLUMN refundable_amount NUMERIC(20,4),
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE returns.return_items ri
SET product_name_snapshot = p.name,
    unit_name_snapshot = pu.display_name,
    conversion_snapshot = pu.conversion_factor,
    original_effective_unit_price = ri.refund_unit_price,
    refundable_amount = ri.refund_total
FROM catalog.products p, catalog.product_units pu
WHERE p.id = ri.product_id
  AND pu.id = ri.product_unit_id
  AND (
    ri.product_name_snapshot IS NULL
    OR ri.unit_name_snapshot IS NULL
    OR ri.conversion_snapshot IS NULL
    OR ri.refundable_amount IS NULL
  );

ALTER TABLE returns.return_items
  ALTER COLUMN product_name_snapshot SET NOT NULL,
  ALTER COLUMN unit_name_snapshot SET NOT NULL,
  ALTER COLUMN conversion_snapshot SET NOT NULL,
  ALTER COLUMN refundable_amount SET NOT NULL,
  ADD CONSTRAINT return_items_disposition_check CHECK (
    disposition IN ('RESTOCK', 'NOT_RESTOCKED')
  ),
  ADD CONSTRAINT return_items_values_check CHECK (
    return_qty > 0
    AND base_return_qty > 0
    AND conversion_snapshot > 0
    AND refund_unit_price >= 0
    AND refund_total >= 0
    AND refundable_amount >= 0
    AND (original_effective_unit_price IS NULL OR original_effective_unit_price >= 0)
    AND (original_cost_unit_snapshot IS NULL OR original_cost_unit_snapshot >= 0)
  );

ALTER TABLE returns.refunds
  ADD COLUMN original_payment_id UUID REFERENCES sales.payments(id) ON DELETE RESTRICT,
  ADD COLUMN refund_number TEXT,
  ADD COLUMN shift_id UUID REFERENCES cash.shifts(id) ON DELETE RESTRICT,
  ADD COLUMN terminal_id UUID REFERENCES core.terminals(id) ON DELETE RESTRICT,
  ADD COLUMN device_id UUID REFERENCES identity.devices(id) ON DELETE RESTRICT,
  ADD COLUMN override_method BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN override_amount BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN override_reason TEXT,
  ADD COLUMN external_reference TEXT,
  ADD COLUMN requested_at TIMESTAMPTZ,
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN failed_at TIMESTAMPTZ,
  ADD COLUMN correlation_id UUID;

UPDATE returns.refunds
SET refund_number = 'RFN-' || upper(replace(id::text, '-', '')),
    requested_at = created_at,
    completed_at = CASE WHEN status = 'COMPLETED' THEN processed_at ELSE completed_at END,
    external_reference = COALESCE(external_reference, processor_reference),
    correlation_id = id
WHERE refund_number IS NULL OR requested_at IS NULL OR correlation_id IS NULL;

ALTER TABLE returns.refunds
  ALTER COLUMN refund_number SET NOT NULL,
  ALTER COLUMN requested_at SET NOT NULL,
  ALTER COLUMN correlation_id SET NOT NULL,
  ADD CONSTRAINT refunds_number_key UNIQUE (business_id, refund_number),
  ADD CONSTRAINT refunds_payment_method_fkey
    FOREIGN KEY (payment_method_id) REFERENCES sales.payment_methods(id) ON DELETE RESTRICT,
  ADD CONSTRAINT refunds_status_check CHECK (
    status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'REQUIRES_ACTION')
  ),
  ADD CONSTRAINT refunds_amount_check CHECK (amount > 0),
  ADD CONSTRAINT refunds_version_check CHECK (version > 0),
  ADD CONSTRAINT refunds_override_reason_check CHECK (
    (NOT override_method AND NOT override_amount) OR override_reason IS NOT NULL
  );

CREATE INDEX refunds_provider_reference_duplicate_aid_idx
ON returns.refunds (business_id, external_reference)
WHERE external_reference IS NOT NULL;
