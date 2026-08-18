-- 000015_create_pricing_schema.sql

CREATE SCHEMA IF NOT EXISTS pricing;

CREATE TABLE pricing.margin_rules (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  scope_type TEXT NOT NULL,
  category_id UUID REFERENCES catalog.categories(id),
  product_unit_id UUID REFERENCES catalog.product_units(id),
  target_margin NUMERIC(12,8) NOT NULL,
  minimum_margin NUMERIC(12,8) NOT NULL,
  rounding_rule TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT margin_rules_pkey PRIMARY KEY (id),
  CONSTRAINT check_margin_scope CHECK (
    (scope_type = 'BUSINESS' AND category_id IS NULL AND product_unit_id IS NULL) OR
    (scope_type = 'CATEGORY' AND category_id IS NOT NULL AND product_unit_id IS NULL) OR
    (scope_type = 'PRODUCT_UNIT' AND category_id IS NULL AND product_unit_id IS NOT NULL)
  )
);

CREATE TABLE pricing.price_sets (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  name TEXT,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  proposed_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT price_sets_pkey PRIMARY KEY (id)
);

CREATE TABLE pricing.price_proposal_items (
  id UUID NOT NULL,
  price_set_id UUID NOT NULL REFERENCES pricing.price_sets(id),
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  pricing_reference_cost_snapshot NUMERIC(24,8),
  current_price_snapshot NUMERIC(20,4),
  recommended_price NUMERIC(20,4),
  proposed_price NUMERIC(20,4) NOT NULL,
  final_approved_price NUMERIC(20,4),
  target_margin_snapshot NUMERIC(12,8),
  minimum_margin_snapshot NUMERIC(12,8),
  calculated_margin NUMERIC(12,8),
  risk_level TEXT NOT NULL,
  item_status TEXT NOT NULL,
  owner_edit_reason TEXT,

  CONSTRAINT price_proposal_items_pkey PRIMARY KEY (id)
);

ALTER TABLE pricing.price_versions ADD COLUMN price_set_id UUID REFERENCES pricing.price_sets(id);
ALTER TABLE pricing.price_versions ADD COLUMN pricing_reference_cost_snapshot NUMERIC(24,8);
ALTER TABLE pricing.price_versions ADD COLUMN tax_mode TEXT;
ALTER TABLE pricing.price_versions ADD COLUMN tax_rate_snapshot NUMERIC(12,8);
ALTER TABLE pricing.price_versions ADD COLUMN created_by UUID;
ALTER TABLE pricing.price_versions ADD COLUMN approved_by UUID;

-- Since tax_mode and tax_rate_snapshot and created_by were added later, we need to set them for existing records
UPDATE pricing.price_versions SET tax_mode = 'TAX_INCLUSIVE', tax_rate_snapshot = 0, created_by = '00000000-0000-0000-0000-000000000000' WHERE tax_mode IS NULL;
ALTER TABLE pricing.price_versions ALTER COLUMN tax_mode SET NOT NULL;
ALTER TABLE pricing.price_versions ALTER COLUMN tax_rate_snapshot SET NOT NULL;
ALTER TABLE pricing.price_versions ALTER COLUMN created_by SET NOT NULL;

CREATE TABLE pricing.promotions (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  name TEXT NOT NULL,
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  promotion_type TEXT NOT NULL,
  value NUMERIC(20,4) NOT NULL,
  min_qty NUMERIC(20,6) NOT NULL,
  priority INTEGER NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT promotions_pkey PRIMARY KEY (id)
);

CREATE TABLE pricing.pricing_review_items (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  reason_type TEXT NOT NULL,
  cost_before NUMERIC(24,8),
  cost_after NUMERIC(24,8),
  current_price NUMERIC(20,4),
  current_margin NUMERIC(12,8),
  status TEXT NOT NULL,
  source_cost_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,

  CONSTRAINT pricing_review_items_pkey PRIMARY KEY (id)
);
