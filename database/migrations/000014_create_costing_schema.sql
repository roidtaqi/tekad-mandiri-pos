-- 000014_create_costing_schema.sql

CREATE SCHEMA IF NOT EXISTS costing;

CREATE TABLE costing.cost_events (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  event_type TEXT NOT NULL,
  quantity_basis NUMERIC(20,6),
  unit_cost_before NUMERIC(24,8),
  unit_cost_after NUMERIC(24,8),
  value_delta NUMERIC(24,8),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id UUID,
  correlation_id UUID,

  CONSTRAINT cost_events_pkey PRIMARY KEY (id)
);

CREATE TABLE costing.product_cost_states (
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  mwa_unit_cost NUMERIC(24,8),
  last_valid_mwa_unit_cost NUMERIC(24,8),
  latest_landed_unit_cost NUMERIC(24,8),
  pricing_reference_unit_cost NUMERIC(24,8),
  pricing_reference_source_type TEXT,
  pricing_reference_source_id UUID,
  last_cost_event_id UUID REFERENCES costing.cost_events(id),
  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT product_cost_states_pkey PRIMARY KEY (business_id, location_id, product_id)
);

CREATE TABLE costing.cogs_reconciliations (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  transaction_item_id UUID NOT NULL REFERENCES sales.transaction_items(id),
  original_cost_snapshot NUMERIC(24,8),
  final_unit_cost NUMERIC(24,8) NOT NULL,
  quantity NUMERIC(20,6) NOT NULL,
  value_delta NUMERIC(24,8) NOT NULL,
  source_cost_event_id UUID NOT NULL REFERENCES costing.cost_events(id),
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT cogs_reconciliations_pkey PRIMARY KEY (id)
);
