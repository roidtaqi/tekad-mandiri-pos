-- 000012_create_purchasing_fulfillment_schema.sql

CREATE TABLE purchasing.receipts (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  location_id UUID NOT NULL REFERENCES core.locations(id),
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  receipt_number TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  received_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT receipts_pkey PRIMARY KEY (id),
  CONSTRAINT receipts_number_unique UNIQUE (business_id, receipt_number)
);

CREATE TABLE purchasing.receipt_items (
  id UUID NOT NULL,
  receipt_id UUID NOT NULL REFERENCES purchasing.receipts(id),
  purchase_item_id UUID NOT NULL REFERENCES purchasing.purchase_items(id),
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  product_unit_id UUID NOT NULL REFERENCES catalog.product_units(id),
  conversion_snapshot NUMERIC(20,8) NOT NULL,
  received_qty NUMERIC(20,6) NOT NULL,
  accepted_qty NUMERIC(20,6) NOT NULL,
  rejected_qty NUMERIC(20,6) NOT NULL,
  free_qty_received NUMERIC(20,6) NOT NULL,
  base_qty_accepted NUMERIC(20,6) NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT receipt_items_pkey PRIMARY KEY (id),
  CONSTRAINT check_received_qty CHECK (received_qty >= 0),
  CONSTRAINT check_accepted_qty CHECK (accepted_qty >= 0),
  CONSTRAINT check_rejected_qty CHECK (rejected_qty >= 0),
  CONSTRAINT check_qty_sum CHECK (accepted_qty + rejected_qty <= received_qty)
);

CREATE TABLE purchasing.purchase_invoices (
  id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  supplier_invoice_number TEXT,
  invoice_date DATE,
  subtotal NUMERIC(20,4) NOT NULL,
  item_discount_total NUMERIC(20,4) NOT NULL,
  global_discount_total NUMERIC(20,4) NOT NULL,
  tax_total NUMERIC(20,4) NOT NULL,
  acquisition_charge_total NUMERIC(20,4) NOT NULL,
  grand_total NUMERIC(20,4) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  captured_by UUID NOT NULL,
  version BIGINT NOT NULL,

  CONSTRAINT purchase_invoices_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_invoices_purchase_unique UNIQUE (purchase_id)
);

CREATE TABLE purchasing.purchase_invoice_items (
  id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES purchasing.purchase_invoices(id),
  purchase_item_id UUID NOT NULL REFERENCES purchasing.purchase_items(id),
  invoiced_qty NUMERIC(20,6) NOT NULL,
  unit_price NUMERIC(20,4) NOT NULL,
  item_discount_amount NUMERIC(20,4) NOT NULL,
  tax_amount NUMERIC(20,4) NOT NULL,
  free_qty NUMERIC(20,6) NOT NULL,

  CONSTRAINT purchase_invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_invoice_items_unique UNIQUE (invoice_id, purchase_item_id)
);

CREATE TABLE purchasing.purchase_charges (
  id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(20,4) NOT NULL,
  allocation_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT purchase_charges_pkey PRIMARY KEY (id)
);

CREATE TABLE purchasing.purchase_payments (
  id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchasing.purchases(id),
  amount NUMERIC(20,4) NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL,
  recorded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT purchase_payments_pkey PRIMARY KEY (id)
);
