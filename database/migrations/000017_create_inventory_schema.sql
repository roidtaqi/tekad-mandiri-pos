-- 000017_create_inventory_schema.sql

CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE inventory.stock_movements (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  movement_type TEXT NOT NULL,
  base_quantity_delta NUMERIC(20,6) NOT NULL,
  source_unit_id UUID REFERENCES catalog.product_units(id),
  source_quantity NUMERIC(20,6),
  conversion_snapshot NUMERIC(20,8),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  source_line_id UUID,
  reason_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id UUID,
  device_id UUID,
  correlation_id UUID,

  CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movements_source_unique UNIQUE (business_id, source_type, source_id, source_line_id, movement_type)
);

CREATE TABLE inventory.stock_balances (
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  base_quantity NUMERIC(20,6) NOT NULL,
  last_movement_id UUID REFERENCES inventory.stock_movements(id),
  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT stock_balances_pkey PRIMARY KEY (business_id, location_id, product_id)
);

CREATE TABLE inventory.stock_adjustments (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  adjustment_number TEXT NOT NULL,
  direction TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id)
);

CREATE TABLE inventory.stock_adjustment_items (
  id UUID NOT NULL,
  adjustment_id UUID NOT NULL REFERENCES inventory.stock_adjustments(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  source_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  qty NUMERIC(20,6) NOT NULL,
  conversion_snapshot NUMERIC(20,8) NOT NULL,
  base_qty NUMERIC(20,6) NOT NULL,
  cost_snapshot NUMERIC(24,8),

  CONSTRAINT stock_adjustment_items_pkey PRIMARY KEY (id)
);

CREATE TABLE inventory.opname_sessions (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  opname_number TEXT NOT NULL,
  status TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  created_by UUID NOT NULL,
  started_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT opname_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE inventory.opname_items (
  id UUID NOT NULL,
  opname_session_id UUID NOT NULL REFERENCES inventory.opname_sessions(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  system_qty_at_count NUMERIC(20,6),
  physical_qty NUMERIC(20,6),
  variance_qty NUMERIC(20,6),
  counted_at TIMESTAMPTZ,
  counted_by UUID,
  count_revision INTEGER NOT NULL,
  recount_recommended BOOLEAN NOT NULL,
  posted_movement_id UUID REFERENCES inventory.stock_movements(id),

  CONSTRAINT opname_items_pkey PRIMARY KEY (id),
  CONSTRAINT opname_items_unique UNIQUE (opname_session_id, product_id)
);
