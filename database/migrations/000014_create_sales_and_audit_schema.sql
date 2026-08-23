-- 000014_create_sales_and_audit_schema.sql
-- Canonical Sales aggregate persistence and append-only Audit/Exception facts.

CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE sales.customers (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT customers_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX customers_business_name_idx
ON sales.customers (business_id, lower(btrim(name)));

CREATE INDEX customers_business_phone_idx
ON sales.customers (business_id, phone)
WHERE phone IS NOT NULL;

CREATE TABLE sales.payment_methods (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_cash BOOLEAN NOT NULL,
  offline_allowed BOOLEAN NOT NULL,
  requires_reference BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT payment_methods_business_code_key UNIQUE (business_id, code),
  CONSTRAINT payment_methods_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE sales.transactions (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES core.locations(id) ON DELETE RESTRICT,
  terminal_id UUID NOT NULL REFERENCES core.terminals(id) ON DELETE RESTRICT,
  device_id UUID NOT NULL REFERENCES identity.devices(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES cash.shifts(id) ON DELETE RESTRICT,
  transaction_number TEXT NOT NULL,
  status TEXT NOT NULL,
  customer_id UUID REFERENCES sales.customers(id) ON DELETE RESTRICT,
  subtotal NUMERIC(20,4) NOT NULL,
  promotion_discount_total NUMERIC(20,4) NOT NULL,
  line_discount_total NUMERIC(20,4) NOT NULL,
  transaction_discount_total NUMERIC(20,4) NOT NULL,
  tax_total NUMERIC(20,4) NOT NULL,
  grand_total NUMERIC(20,4) NOT NULL,
  total_paid NUMERIC(20,4) NOT NULL,
  change_amount NUMERIC(20,4) NOT NULL,
  cost_status TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  authorization_version BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  correlation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transactions_business_number_key UNIQUE (business_id, transaction_number),
  CONSTRAINT transactions_status_check
    CHECK (status IN ('DRAFT', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED', 'VOIDED')),
  CONSTRAINT transactions_cost_status_check
    CHECK (cost_status IN ('FINAL', 'PROVISIONAL', 'COST_PENDING')),
  CONSTRAINT transactions_amounts_nonnegative_check CHECK (
    subtotal >= 0
    AND promotion_discount_total >= 0
    AND line_discount_total >= 0
    AND transaction_discount_total >= 0
    AND tax_total >= 0
    AND grand_total >= 0
    AND total_paid >= 0
    AND change_amount >= 0
  )
);

CREATE INDEX transactions_business_occurred_idx
ON sales.transactions (business_id, occurred_at DESC);

CREATE INDEX transactions_business_shift_idx
ON sales.transactions (business_id, shift_id);

CREATE TABLE sales.transaction_items (
  id UUID NOT NULL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES sales.transactions(id) ON DELETE RESTRICT,
  line_index INTEGER NOT NULL,
  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  unit_code_snapshot TEXT NOT NULL,
  unit_name_snapshot TEXT NOT NULL,
  conversion_snapshot NUMERIC(20,8) NOT NULL,
  quantity NUMERIC(20,6) NOT NULL,
  base_quantity NUMERIC(20,6) NOT NULL,
  price_version_id_snapshot UUID REFERENCES pricing.price_versions(id) ON DELETE RESTRICT,
  price_effective_from_snapshot TIMESTAMPTZ,
  base_unit_price_snapshot NUMERIC(20,4) NOT NULL,
  tier_code_snapshot TEXT,
  tier_unit_price_snapshot NUMERIC(20,4),
  promotion_id UUID,
  promotion_discount_snapshot NUMERIC(20,4) NOT NULL,
  manual_line_discount_snapshot NUMERIC(20,4) NOT NULL,
  transaction_discount_allocation NUMERIC(20,4) NOT NULL,
  final_unit_price_snapshot NUMERIC(20,4) NOT NULL,
  line_total NUMERIC(20,4) NOT NULL,
  tax_mode_snapshot TEXT NOT NULL,
  tax_rate_snapshot NUMERIC(12,8) NOT NULL,
  tax_amount_snapshot NUMERIC(20,4) NOT NULL,
  cost_unit_snapshot NUMERIC(24,8),
  cost_status TEXT NOT NULL,
  track_inventory_snapshot BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transaction_items_line_key UNIQUE (transaction_id, line_index),
  CONSTRAINT transaction_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT transaction_items_conversion_check CHECK (conversion_snapshot > 0),
  CONSTRAINT transaction_items_base_quantity_check CHECK (base_quantity > 0),
  CONSTRAINT transaction_items_amounts_nonnegative_check CHECK (
    base_unit_price_snapshot >= 0
    AND (tier_unit_price_snapshot IS NULL OR tier_unit_price_snapshot >= 0)
    AND promotion_discount_snapshot >= 0
    AND manual_line_discount_snapshot >= 0
    AND transaction_discount_allocation >= 0
    AND final_unit_price_snapshot >= 0
    AND line_total >= 0
    AND tax_amount_snapshot >= 0
  ),
  CONSTRAINT transaction_items_cost_status_check
    CHECK (cost_status IN ('FINAL', 'PROVISIONAL', 'COST_PENDING')),
  CONSTRAINT transaction_items_cost_pending_check CHECK (
    (cost_status = 'COST_PENDING' AND cost_unit_snapshot IS NULL)
    OR (cost_status IN ('FINAL', 'PROVISIONAL') AND cost_unit_snapshot IS NOT NULL AND cost_unit_snapshot >= 0)
  )
);

CREATE INDEX transaction_items_product_created_idx
ON sales.transaction_items (product_id, created_at DESC);

CREATE TABLE sales.transaction_discounts (
  id UUID NOT NULL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES sales.transactions(id) ON DELETE RESTRICT,
  discount_type TEXT NOT NULL,
  requested_value NUMERIC(20,4) NOT NULL,
  calculated_amount NUMERIC(20,4) NOT NULL,
  reason TEXT,
  applied_by UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transaction_discounts_type_check CHECK (discount_type IN ('PERCENT', 'FIXED_AMOUNT')),
  CONSTRAINT transaction_discounts_amount_check CHECK (requested_value >= 0 AND calculated_amount >= 0)
);

CREATE TABLE sales.transaction_discount_allocations (
  transaction_discount_id UUID NOT NULL REFERENCES sales.transaction_discounts(id) ON DELETE RESTRICT,
  transaction_item_id UUID NOT NULL REFERENCES sales.transaction_items(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(20,4) NOT NULL,
  PRIMARY KEY (transaction_discount_id, transaction_item_id),
  CONSTRAINT transaction_discount_allocations_amount_check CHECK (allocated_amount >= 0)
);

CREATE TABLE sales.payments (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL REFERENCES sales.transactions(id) ON DELETE RESTRICT,
  payment_method_id UUID NOT NULL REFERENCES sales.payment_methods(id) ON DELETE RESTRICT,
  method_code_snapshot TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  amount_tendered NUMERIC(20,4),
  change_amount NUMERIC(20,4),
  status TEXT NOT NULL,
  confirmation_type TEXT NOT NULL,
  external_reference TEXT,
  original_payment_id UUID REFERENCES sales.payments(id) ON DELETE RESTRICT,
  reversal_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  recorded_by UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  device_id UUID REFERENCES identity.devices(id) ON DELETE RESTRICT,
  correlation_id UUID,
  CONSTRAINT payments_status_check CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
  CONSTRAINT payments_confirmation_type_check
    CHECK (confirmation_type IN ('CASH_CONFIRMED', 'MANUAL_CONFIRMED', 'PROVIDER_VERIFIED')),
  CONSTRAINT payments_amount_check CHECK (
    amount >= 0
    AND (amount_tendered IS NULL OR amount_tendered >= 0)
    AND (change_amount IS NULL OR change_amount >= 0)
  )
);

CREATE INDEX payments_transaction_idx ON sales.payments (transaction_id);

CREATE INDEX payments_external_reference_idx
ON sales.payments (business_id, external_reference)
WHERE external_reference IS NOT NULL;

CREATE TABLE audit.audit_events (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES core.locations(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES identity.users(id) ON DELETE RESTRICT,
  actor_role_snapshot TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  device_id UUID REFERENCES identity.devices(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES identity.sessions(id) ON DELETE RESTRICT,
  reason TEXT,
  before_data JSONB,
  after_data JSONB,
  correlation_id UUID,
  authorization_version BIGINT,
  CONSTRAINT audit_events_actor_type_check
    CHECK (actor_type IN ('USER', 'SYSTEM', 'SYNC', 'AUTOMATION'))
);

CREATE INDEX audit_events_business_entity_idx
ON audit.audit_events (business_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX audit_events_business_actor_idx
ON audit.audit_events (business_id, actor_user_id, occurred_at DESC);

CREATE TABLE audit.business_exceptions (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES core.locations(id) ON DELETE RESTRICT,
  domain TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id UUID NOT NULL,
  summary TEXT NOT NULL,
  impact_amount NUMERIC(20,4),
  impact_quantity NUMERIC(20,6),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES identity.users(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES identity.users(id) ON DELETE RESTRICT,
  resolution TEXT,
  CONSTRAINT business_exceptions_severity_check
    CHECK (severity IN ('INFO', 'WARNING', 'REVIEW_REQUIRED', 'CRITICAL')),
  CONSTRAINT business_exceptions_status_check
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'))
);

CREATE INDEX business_exceptions_attention_idx
ON audit.business_exceptions (business_id, status, severity, created_at DESC);
