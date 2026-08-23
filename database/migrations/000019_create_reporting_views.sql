-- 000019_create_reporting_views.sql

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
  c.mwa_unit_cost AS mwa_cost,
  (b.base_quantity * c.mwa_unit_cost) AS inventory_value,
  b.updated_at AS last_movement_at
FROM inventory.stock_balances b
JOIN catalog.products p
  ON p.business_id = b.business_id
 AND p.id = b.product_id
LEFT JOIN costing.product_cost_states c
  ON c.business_id = b.business_id
 AND c.location_id = b.location_id
 AND c.product_id = b.product_id;

CREATE OR REPLACE VIEW reporting.v_product_commercial_summary AS
WITH inventory_summary AS (
  SELECT business_id, product_id, SUM(base_quantity) AS total_stock
  FROM inventory.stock_balances
  GROUP BY business_id, product_id
),
cost_summary AS (
  SELECT
    business_id,
    product_id,
    MAX(mwa_unit_cost) AS current_mwa,
    MAX(latest_landed_unit_cost) AS latest_landed
  FROM costing.product_cost_states
  GROUP BY business_id, product_id
),
active_retail_price AS (
  SELECT
    pv.business_id,
    pu.product_id,
    MAX(pt.unit_price) AS active_retail_price
  FROM pricing.price_versions pv
  JOIN catalog.product_units pu
    ON pu.business_id = pv.business_id
   AND pu.id = pv.product_unit_id
  JOIN pricing.price_tier_versions pt
    ON pt.price_version_id = pv.id
   AND pt.tier_code = 'RETAIL'
   AND pt.min_qty = 1
  WHERE pv.status = 'ACTIVE'
    AND pv.effective_from <= CURRENT_TIMESTAMP
    AND (pv.effective_to IS NULL OR pv.effective_to > CURRENT_TIMESTAMP)
  GROUP BY pv.business_id, pu.product_id
)
SELECT
  p.id AS product_id,
  p.business_id,
  p.name AS product_name,
  COALESCE(i.total_stock, 0) AS total_stock,
  c.current_mwa,
  c.latest_landed,
  a.active_retail_price
FROM catalog.products p
LEFT JOIN inventory_summary i
  ON i.business_id = p.business_id
 AND i.product_id = p.id
LEFT JOIN cost_summary c
  ON c.business_id = p.business_id
 AND c.product_id = p.id
LEFT JOIN active_retail_price a
  ON a.business_id = p.business_id
 AND a.product_id = p.id;
