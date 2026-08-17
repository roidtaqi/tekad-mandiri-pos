import { test, expect } from "vitest";
import { withDatabase } from "./helpers.js";
import { v4 as uuidv4 } from "uuid";

test("pricing schema limits ACTIVE price versions to one per product unit", async () => {
  await withDatabase(async (db) => {
    const businessId = uuidv4();
    const productId = uuidv4();
    const productUnitId = uuidv4();

    await db.query(`INSERT INTO core.businesses (id, name, type) VALUES ($1, 'B1', 'RETAIL')`, [businessId]);
    await db.query(`INSERT INTO catalog.products (id, business_id, sku, name, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', 'PCS', false, 'ACTIVE')`, [productId, businessId]);
    await db.query(`INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status) VALUES ($1, $2, $3, 'PCS', 'Pieces', 1, true, true, false, 'ACTIVE')`, [productUnitId, businessId, productId]);

    const pv1 = uuidv4();
    await db.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from) VALUES ($1, $2, $3, 'ACTIVE', now())`, [pv1, businessId, productUnitId]);

    const pv2 = uuidv4();
    await expect(
      db.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from) VALUES ($1, $2, $3, 'ACTIVE', now())`, [pv2, businessId, productUnitId])
    ).rejects.toThrow();

    const pv3 = uuidv4();
    await expect(
      db.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from) VALUES ($1, $2, $3, 'SCHEDULED', now())`, [pv3, businessId, productUnitId])
    ).resolves.not.toThrow();
  });
});

test("pricing schema accepts zero unit price but not negative", async () => {
  await withDatabase(async (db) => {
    const businessId = uuidv4();
    const productId = uuidv4();
    const productUnitId = uuidv4();

    await db.query(`INSERT INTO core.businesses (id, name, type) VALUES ($1, 'B1', 'RETAIL')`, [businessId]);
    await db.query(`INSERT INTO catalog.products (id, business_id, sku, name, base_unit_code, track_inventory, status) VALUES ($1, $2, 'SKU1', 'P1', 'PCS', false, 'ACTIVE')`, [productId, businessId]);
    await db.query(`INSERT INTO catalog.product_units (id, business_id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status) VALUES ($1, $2, $3, 'PCS', 'Pieces', 1, true, true, false, 'ACTIVE')`, [productUnitId, businessId, productId]);

    const pv1 = uuidv4();
    await db.query(`INSERT INTO pricing.price_versions (id, business_id, product_unit_id, status, effective_from) VALUES ($1, $2, $3, 'ACTIVE', now())`, [pv1, businessId, productUnitId]);

    const pt1 = uuidv4();
    await expect(
      db.query(`INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order) VALUES ($1, $2, 'RETAIL', 1, 0, 1)`, [pt1, pv1])
    ).resolves.not.toThrow();

    const pt2 = uuidv4();
    await expect(
      db.query(`INSERT INTO pricing.price_tier_versions (id, price_version_id, tier_code, min_qty, unit_price, sort_order) VALUES ($1, $2, 'WHOLESALE', 2, -100, 2)`, [pt2, pv1])
    ).rejects.toThrow();
  });
});
