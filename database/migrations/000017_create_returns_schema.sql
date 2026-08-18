-- 000017_create_returns_schema.sql

CREATE SCHEMA IF NOT EXISTS returns;

CREATE TABLE returns.customer_returns (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  return_number TEXT NOT NULL,
  original_transaction_id UUID NOT NULL REFERENCES sales.transactions(id),
  customer_id UUID REFERENCES sales.customers(id),
  status TEXT NOT NULL,
  refund_status TEXT NOT NULL,
  return_total NUMERIC(20,4) NOT NULL,
  refunded_total NUMERIC(20,4) NOT NULL,
  reason_code TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  version BIGINT NOT NULL,

  CONSTRAINT customer_returns_pkey PRIMARY KEY (id),
  CONSTRAINT customer_returns_number_unique UNIQUE (business_id, return_number)
);

CREATE TABLE returns.return_items (
  id UUID NOT NULL,
  customer_return_id UUID NOT NULL REFERENCES returns.customer_returns(id),
  original_transaction_item_id UUID NOT NULL REFERENCES sales.transaction_items(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  return_qty NUMERIC(20,6) NOT NULL,
  base_return_qty NUMERIC(20,6) NOT NULL,
  refund_unit_price NUMERIC(20,4) NOT NULL,
  refund_total NUMERIC(20,4) NOT NULL,
  disposition TEXT NOT NULL,
  posted_movement_id UUID REFERENCES inventory.stock_movements(id),
  reason_code TEXT NOT NULL,
  condition_notes TEXT,

  CONSTRAINT return_items_pkey PRIMARY KEY (id)
);

CREATE TABLE returns.refunds (
  id UUID NOT NULL,
  customer_return_id UUID NOT NULL REFERENCES returns.customer_returns(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  amount NUMERIC(20,4) NOT NULL,
  payment_method_id UUID NOT NULL,
  status TEXT NOT NULL,
  processor_reference TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT refunds_pkey PRIMARY KEY (id)
);
