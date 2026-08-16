import { 
  ProductListQuery, 
  ProductListResponse, 
  ProductDetailResponse, 
  CatalogCategoryOption, 
  CatalogBrandOption,
  CatalogError 
} from "@kastur/contracts";
import { ActorContext, SqlExecutor } from "../core/context.js";

export async function listProducts(
  ctx: ActorContext,
  executor: SqlExecutor,
  query: ProductListQuery
): Promise<ProductListResponse> {
  if (!ctx.permissions.has("product.read")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.read permission");
  }

  const conditions: string[] = ["p.business_id = $1"];
  const params: unknown[] = [ctx.business_id];

  if (query.q) {
    // Search by Name, SKU, or Barcode exact match
    params.push(`%${query.q}%`);
    params.push(query.q);
    conditions.push(`(
      p.name ILIKE $2 OR 
      p.sku ILIKE $2 OR 
      EXISTS (
        SELECT 1 FROM catalog.product_units pu
        JOIN catalog.barcodes b ON pu.id = b.product_unit_id
        WHERE pu.product_id = p.id AND b.barcode = $3
      )
    )`);
  }

  if (query.category_id) {
    params.push(query.category_id);
    conditions.push(`p.category_id = $${params.length}`);
  }

  if (query.brand_id) {
    params.push(query.brand_id);
    conditions.push(`p.brand_id = $${params.length}`);
  }

  if (query.status) {
    params.push(query.status);
    conditions.push(`p.status = $${params.length}`);
  }

  if (query.track_inventory !== undefined) {
    params.push(query.track_inventory);
    conditions.push(`p.track_inventory = $${params.length}`);
  }

  const where = "WHERE " + conditions.join(" AND ");
  
  let orderBy = "p.created_at DESC";
  if (query.sort === "name_asc") orderBy = "p.name ASC";
  else if (query.sort === "name_desc") orderBy = "p.name DESC";

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);

  const countRes = await executor.query(`SELECT COUNT(*) as total FROM catalog.products p ${where}`, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const sql = `
    SELECT 
      p.id, p.sku, p.name, p.base_unit_code, p.track_inventory, p.status, p.version,
      c.id as category_id, c.name as category_name,
      b.id as brand_id, b.name as brand_name
    FROM catalog.products p
    JOIN catalog.categories c ON p.category_id = c.id
    LEFT JOIN catalog.brands b ON p.brand_id = b.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const res = await executor.query(sql, params);

  return {
    items: res.rows.map((r: any) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      base_unit_code: r.base_unit_code,
      track_inventory: r.track_inventory,
      status: r.status,
      version: r.version,
      category: { id: r.category_id, name: r.category_name },
      brand: r.brand_id ? { id: r.brand_id, name: r.brand_name } : null
    })),
    total
  };
}

export async function getProductDetail(
  ctx: ActorContext,
  executor: SqlExecutor,
  productId: string
): Promise<ProductDetailResponse> {
  if (!ctx.permissions.has("product.read")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.read permission");
  }

  const pRes = await executor.query(`
    SELECT 
      p.id, p.sku, p.name, p.base_unit_code, p.track_inventory, p.status, p.version, p.created_at, p.updated_at,
      c.id as category_id, c.name as category_name,
      b.id as brand_id, b.name as brand_name
    FROM catalog.products p
    JOIN catalog.categories c ON p.category_id = c.id
    LEFT JOIN catalog.brands b ON p.brand_id = b.id
    WHERE p.business_id = $1 AND p.id = $2
  `, [ctx.business_id, productId]);

  if (pRes.rows.length === 0) {
    throw new CatalogError("ENTITY_NOT_FOUND", "Product not found");
  }
  const p = pRes.rows[0];

  const uRes = await executor.query(`
    SELECT id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status, version
    FROM catalog.product_units
    WHERE business_id = $1 AND product_id = $2
    ORDER BY created_at ASC
  `, [ctx.business_id, productId]);

  const bRes = await executor.query(`
    SELECT b.id, b.product_unit_id, b.barcode, b.is_internal, b.status, b.deactivated_at
    FROM catalog.barcodes b
    JOIN catalog.product_units pu ON b.product_unit_id = pu.id
    WHERE pu.business_id = $1 AND pu.product_id = $2
  `, [ctx.business_id, productId]);

  const units = uRes.rows.map((u: any) => {
    const barcodes = bRes.rows.filter((b: any) => b.product_unit_id === u.id).map((b: any) => ({
      id: b.id,
      barcode: b.barcode,
      is_internal: b.is_internal,
      status: b.status,
      deactivated_at: b.deactivated_at ? b.deactivated_at.toISOString() : null
    }));
    return {
      id: u.id,
      unit_code: u.unit_code,
      display_name: u.display_name,
      conversion_factor: u.conversion_factor,
      can_sell: u.can_sell,
      can_purchase: u.can_purchase,
      allow_decimal_qty: u.allow_decimal_qty,
      status: u.status,
      version: u.version,
      barcodes
    };
  });

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    base_unit_code: p.base_unit_code,
    track_inventory: p.track_inventory,
    status: p.status,
    version: p.version,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
    category: { id: p.category_id, name: p.category_name },
    brand: p.brand_id ? { id: p.brand_id, name: p.brand_name } : null,
    units
  };
}

export async function listCategories(
  ctx: ActorContext,
  executor: SqlExecutor
): Promise<CatalogCategoryOption[]> {
  if (!ctx.permissions.has("product.read")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.read permission");
  }
  const res = await executor.query(
    `SELECT id, name FROM catalog.categories WHERE business_id = $1 AND status = 'ACTIVE' ORDER BY name ASC`,
    [ctx.business_id]
  );
  return res.rows;
}

export async function listBrands(
  ctx: ActorContext,
  executor: SqlExecutor
): Promise<CatalogBrandOption[]> {
  if (!ctx.permissions.has("product.read")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.read permission");
  }
  const res = await executor.query(
    `SELECT id, name FROM catalog.brands WHERE business_id = $1 AND status = 'ACTIVE' ORDER BY name ASC`,
    [ctx.business_id]
  );
  return res.rows;
}

export async function buildPosCatalogBootstrapProjection(
  ctx: ActorContext,
  executor: SqlExecutor,
  serverTime: string
): Promise<import("@kastur/contracts").PosCatalogBootstrapSnapshot> {
  if (!ctx.permissions.has("workspace.pos.access")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires workspace.pos.access permission");
  }

  const pRes = await executor.query(`
    SELECT 
      id, sku, name, base_unit_code, track_inventory, status, version, updated_at
    FROM catalog.products
    WHERE business_id = $1
    ORDER BY id ASC
  `, [ctx.business_id]);

  const uRes = await executor.query(`
    SELECT 
      id, product_id, unit_code, display_name, conversion_factor, can_sell, can_purchase, allow_decimal_qty, status, version, updated_at
    FROM catalog.product_units
    WHERE business_id = $1
    ORDER BY id ASC
  `, [ctx.business_id]);

  const bRes = await executor.query(`
    SELECT 
      b.id, b.product_unit_id, b.barcode, b.is_internal, b.status, b.deactivated_at
    FROM catalog.barcodes b
    JOIN catalog.product_units pu ON b.product_unit_id = pu.id
    WHERE pu.business_id = $1
    ORDER BY b.id ASC
  `, [ctx.business_id]);

  return {
    bootstrap_version: 1,
    business_id: ctx.business_id,
    server_time: serverTime,
    products: pRes.rows.map((p: any) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      base_unit_code: p.base_unit_code,
      track_inventory: p.track_inventory,
      status: p.status,
      version: p.version,
      updated_at: p.updated_at.toISOString()
    })),
    product_units: uRes.rows.map((u: any) => ({
      id: u.id,
      product_id: u.product_id,
      unit_code: u.unit_code,
      display_name: u.display_name,
      conversion_factor: u.conversion_factor, // Already string from NUMERIC mapping
      can_sell: u.can_sell,
      can_purchase: u.can_purchase,
      allow_decimal_qty: u.allow_decimal_qty,
      status: u.status,
      version: u.version,
      updated_at: u.updated_at.toISOString()
    })),
    barcodes: bRes.rows.map((b: any) => ({
      id: b.id,
      product_unit_id: b.product_unit_id,
      barcode: b.barcode,
      is_internal: b.is_internal,
      status: b.status,
      deactivated_at: b.deactivated_at ? b.deactivated_at.toISOString() : null
    }))
  };
}
