-- M1-005: Product Unit + Barcode

-- 1. TENANT-SAFE PRODUCT REFERENCE
-- Add a unique constraint to products to allow composite foreign keys
ALTER TABLE catalog.products
ADD CONSTRAINT products_business_id_id_key UNIQUE (business_id, id);

-- 2. catalog.product_units
CREATE TABLE catalog.product_units (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    product_id UUID NOT NULL,
    unit_code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    conversion_factor NUMERIC(20,8) NOT NULL CHECK (conversion_factor > 0),
    can_sell BOOLEAN NOT NULL,
    can_purchase BOOLEAN NOT NULL,
    allow_decimal_qty BOOLEAN NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    
    -- PRODUCT UNIT SAME-BUSINESS PRODUCT FK
    CONSTRAINT fk_product_unit_business
        FOREIGN KEY (business_id) 
        REFERENCES core.businesses(id)
        ON DELETE RESTRICT,
        
    CONSTRAINT fk_product_unit_product 
        FOREIGN KEY (business_id, product_id)
        REFERENCES catalog.products(business_id, id)
        ON DELETE RESTRICT,
        
    -- PRODUCT UNIT CODE UNIQUENESS
    CONSTRAINT uq_product_id_unit_code UNIQUE (product_id, unit_code),
    
    -- PRODUCT UNIT BUSINESS-ID SUPPORT FOR BARCODE (Supports same-business FK)
    CONSTRAINT product_units_business_id_id_key UNIQUE (business_id, id)
);

-- 3. catalog.barcodes
CREATE TABLE catalog.barcodes (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    product_unit_id UUID NOT NULL,
    barcode TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMPTZ NULL,

    -- BARCODE BUSINESS FK
    CONSTRAINT fk_barcode_business
        FOREIGN KEY (business_id) 
        REFERENCES core.businesses(id)
        ON DELETE RESTRICT,
        
    -- BARCODE SAME-BUSINESS PRODUCT UNIT FK
    CONSTRAINT fk_barcode_product_unit 
        FOREIGN KEY (business_id, product_unit_id)
        REFERENCES catalog.product_units(business_id, id)
        ON DELETE RESTRICT
);

-- ACTIVE BARCODE UNIQUENESS
CREATE UNIQUE INDEX barcodes_business_id_barcode_active_idx 
ON catalog.barcodes (business_id, barcode) 
WHERE status = 'ACTIVE';
