-- M2-002: Minimal Published Retail Pricing

CREATE SCHEMA IF NOT EXISTS pricing;

-- 1. pricing.price_versions
CREATE TABLE pricing.price_versions (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    product_unit_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'ACTIVE', 'SUPERSEDED', 'CANCELLED')),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- PRICE VERSION SAME-BUSINESS PRODUCT UNIT FK
    CONSTRAINT fk_price_version_product_unit 
        FOREIGN KEY (business_id, product_unit_id)
        REFERENCES catalog.product_units(business_id, id)
        ON DELETE RESTRICT,
    
    -- EFFECTIVE INTERVAL CHECK
    CONSTRAINT chk_price_version_effective_interval 
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- ONE ACTIVE VERSION PER PRODUCT UNIT
CREATE UNIQUE INDEX price_versions_active_uq_idx 
ON pricing.price_versions (business_id, product_unit_id) 
WHERE status = 'ACTIVE';

-- PRICE VERSION INDEX
CREATE INDEX price_versions_lookup_idx
ON pricing.price_versions (business_id, product_unit_id, effective_from DESC);

-- 2. pricing.price_tier_versions
CREATE TABLE pricing.price_tier_versions (
    id UUID NOT NULL PRIMARY KEY,
    price_version_id UUID NOT NULL,
    tier_code TEXT NOT NULL,
    min_qty NUMERIC(20,6) NOT NULL CHECK (min_qty > 0),
    unit_price NUMERIC(20,4) NOT NULL CHECK (unit_price >= 0),
    sort_order INTEGER NOT NULL,

    -- TIER VERSION FK
    CONSTRAINT fk_tier_version_price_version
        FOREIGN KEY (price_version_id)
        REFERENCES pricing.price_versions(id)
        ON DELETE RESTRICT,
        
    -- TIER UNIQUENESS CONSTRAINTS
    CONSTRAINT uq_tier_version_code UNIQUE (price_version_id, tier_code),
    CONSTRAINT uq_tier_version_min_qty UNIQUE (price_version_id, min_qty)
);
