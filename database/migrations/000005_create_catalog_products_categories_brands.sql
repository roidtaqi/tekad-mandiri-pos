-- Migration 000005: Create Catalog Products, Categories, Brands
-- Applies catalog schema namespace and canonical master tables.

CREATE SCHEMA IF NOT EXISTS catalog;

-- 1. catalog.categories
CREATE TABLE catalog.categories (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT categories_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT categories_business_fk FOREIGN KEY (business_id) REFERENCES core.businesses(id) ON DELETE RESTRICT,
    CONSTRAINT categories_business_id_key UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX categories_normalized_name_idx ON catalog.categories (business_id, lower(btrim(name)));

-- 2. catalog.brands
CREATE TABLE catalog.brands (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT brands_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT brands_business_fk FOREIGN KEY (business_id) REFERENCES core.businesses(id) ON DELETE RESTRICT,
    CONSTRAINT brands_business_id_key UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX brands_normalized_name_idx ON catalog.brands (business_id, lower(btrim(name)));

-- 3. catalog.products
CREATE TABLE catalog.products (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category_id UUID NOT NULL,
    brand_id UUID,
    base_unit_code TEXT NOT NULL,
    track_inventory BOOLEAN NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT products_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT products_business_fk FOREIGN KEY (business_id) REFERENCES core.businesses(id) ON DELETE RESTRICT,
    CONSTRAINT products_category_fk FOREIGN KEY (business_id, category_id) REFERENCES catalog.categories(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT products_brand_fk FOREIGN KEY (business_id, brand_id) REFERENCES catalog.brands(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT products_sku_key UNIQUE (business_id, sku)
);
