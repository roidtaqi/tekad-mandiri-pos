-- 000018_create_reporting_views.sql

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE OR REPLACE VIEW reporting.v_inventory_position AS
SELECT
  b.business_id,
  b.location_id,
  b.product_id,
  p.name AS product_name,
  p.base_unit_code AS base_unit,
  b.base_quantity AS stock_qty,
  CASE
    WHEN b.base_quantity > 0 THEN 'IN_STOCK'
    WHEN b.base_quantity = 0 THEN 'OUT_OF_STOCK'
    ELSE 'NEGATIVE'
  END AS availability,
  COALESCE(c.unit_mwa, 0) AS mwa_cost,
  (b.base_quantity * COALESCE(c.unit_mwa, 0)) AS inventory_value,
  b.updated_at AS last_movement_at
FROM inventory.stock_balances b
JOIN catalog.products p ON b.product_id = p.id
LEFT JOIN costing.product_cost_states c ON b.product_id = c.product_id AND b.location_id = c.location_id;

CREATE OR REPLACE VIEW reporting.v_product_commercial_summary AS
SELECT
  p.id AS product_id,
  p.business_id,
  p.name AS product_name,
  COALESCE(SUM(b.base_quantity), 0) AS total_stock,
  MAX(c.unit_mwa) AS current_mwa,
  MAX(c.latest_landed_cost) AS latest_landed,
  MAX(pv.unit_price) AS active_retail_price
FROM catalog.products p
LEFT JOIN inventory.stock_balances b ON p.id = b.product_id
LEFT JOIN costing.product_cost_states c ON p.id = c.product_id
LEFT JOIN pricing.price_versions pv ON p.id = pv.product_unit_id AND pv.effective_to IS NULL
GROUP BY p.id, p.business_id, p.name;
