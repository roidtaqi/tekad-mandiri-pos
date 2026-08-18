-- 000010_create_catalog_suppliers_and_product_suppliers.sql

CREATE TABLE catalog.suppliers (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_details_json JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

CREATE TABLE catalog.product_suppliers (
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  supplier_id UUID NOT NULL REFERENCES catalog.suppliers(id),
  supplier_sku TEXT,
  is_preferred BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT product_suppliers_pkey PRIMARY KEY (product_id, supplier_id)
);
