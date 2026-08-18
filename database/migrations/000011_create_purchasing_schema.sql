-- 000011_create_purchasing_schema.sql

CREATE SCHEMA IF NOT EXISTS purchasing;

CREATE TABLE purchasing.purchases (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  supplier_id UUID NOT NULL REFERENCES catalog.suppliers(id),
  purchase_number TEXT NOT NULL,
  supplier_invoice_number TEXT,
  status TEXT NOT NULL,
  integrity_status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  ready_to_post_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT purchases_pkey PRIMARY KEY (id),
  CONSTRAINT purchases_number_unique UNIQUE (business_id, purchase_number)
);

CREATE TABLE purchasing.purchase_items (
  id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  product_name_snapshot TEXT NOT NULL,
  unit_name_snapshot TEXT NOT NULL,
  conversion_snapshot NUMERIC(20,8) NOT NULL,
  expected_qty NUMERIC(20,6) NOT NULL,
  agreed_unit_price NUMERIC(20,4),
  agreed_discount_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  agreed_free_qty NUMERIC(20,6) NOT NULL DEFAULT 0,
  invoice_unit_price NUMERIC(20,4),
  invoice_discount_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  invoice_free_qty NUMERIC(20,6) NOT NULL DEFAULT 0,
  final_landed_cost_per_base_unit NUMERIC(24,8),
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT purchase_items_pkey PRIMARY KEY (id)
);

CREATE TABLE purchasing.purchase_agreement_snapshots (
  id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  snapshot_version INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL,
  locked_by UUID NOT NULL,

  CONSTRAINT purchase_agreement_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_agreement_snapshots_unique UNIQUE (purchase_id, snapshot_version)
);
