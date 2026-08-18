-- 000013_create_purchasing_returns_and_corrections_schema.sql

CREATE TABLE purchasing.purchase_corrections (
  id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  reason TEXT NOT NULL,
  correction_type TEXT NOT NULL,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  correlation_id UUID NOT NULL,

  CONSTRAINT purchase_corrections_pkey PRIMARY KEY (id)
);

CREATE TABLE purchasing.supplier_returns (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  supplier_id UUID NOT NULL REFERENCES catalog.suppliers(id),
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  return_number TEXT NOT NULL,
  status TEXT NOT NULL,
  settlement_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,

  CONSTRAINT supplier_returns_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_returns_number_unique UNIQUE (business_id, return_number)
);

CREATE TABLE purchasing.supplier_return_items (
  id UUID NOT NULL,
  supplier_return_id UUID NOT NULL REFERENCES purchasing.supplier_returns(id),
  purchase_item_id UUID NOT NULL REFERENCES purchasing.purchase_items(id),
  receipt_item_id UUID REFERENCES purchasing.receipt_items(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  qty NUMERIC(20,6) NOT NULL,
  base_qty NUMERIC(20,6) NOT NULL,
  original_landed_cost_per_base_unit NUMERIC(24,8) NOT NULL,
  reason TEXT NOT NULL,

  CONSTRAINT supplier_return_items_pkey PRIMARY KEY (id),
  CONSTRAINT check_return_qty CHECK (qty > 0),
  CONSTRAINT check_return_base_qty CHECK (base_qty > 0)
);
