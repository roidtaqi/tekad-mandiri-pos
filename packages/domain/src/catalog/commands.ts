import { CreateProductRequest, CreateProductResult, CatalogError, CreateSupplierRequest, CreateSupplierResult, CreateProductSupplierRequest, CreateProductSupplierResult } from "@kastur/contracts";
import { ActorContext, SqlExecutor } from "../core/context.js";

export async function createProduct(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreateProductRequest
): Promise<CreateProductResult> {
  if (!ctx.permissions.has("product.create")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.create permission");
  }

  const name = req.name.trim();
  if (!name) throw new CatalogError("VALIDATION_ERROR", "Name is required", "name");
  if (!req.sku) throw new CatalogError("VALIDATION_ERROR", "SKU is required", "sku");
  if (!req.base_unit_code) throw new CatalogError("VALIDATION_ERROR", "Base unit code is required", "base_unit_code");
  if (!req.category_id) throw new CatalogError("VALIDATION_ERROR", "Category is required", "category_id");
  if (typeof req.track_inventory !== "boolean") throw new CatalogError("VALIDATION_ERROR", "Track inventory must be a boolean", "track_inventory");

  try {
    const res = await executor.query(
      `INSERT INTO catalog.products (id, business_id, sku, name, category_id, brand_id, base_unit_code, track_inventory, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
       RETURNING version`,
      [req.product_id, ctx.business_id, req.sku, name, req.category_id, req.brand_id, req.base_unit_code, req.track_inventory]
    );
    return {
      product_id: req.product_id,
      version: res.rows[0].version
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "products_sku_key") {
      throw new CatalogError("SKU_ALREADY_EXISTS", "SKU already exists", "sku");
    }
    if (err.code === "23503" && err.constraint === "products_category_fk") {
      throw new CatalogError("ENTITY_NOT_FOUND", "Category not found", "category_id");
    }
    if (err.code === "23503" && err.constraint === "products_brand_fk") {
      throw new CatalogError("ENTITY_NOT_FOUND", "Brand not found", "brand_id");
    }
    throw err;
  }
}

export async function createSupplier(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreateSupplierRequest
): Promise<CreateSupplierResult> {
  if (!ctx.permissions.has("product.create")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.create permission");
  }

  const name = req.name.trim();
  if (!name) throw new CatalogError("VALIDATION_ERROR", "Name is required", "name");

  try {
    const res = await executor.query(
      `INSERT INTO catalog.suppliers (id, business_id, code, name, phone, email, address, payment_details_json, status, created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', NOW(), NOW(), 1)
       RETURNING version`,
      [req.supplier_id, ctx.business_id, req.code, name, req.phone, req.email, req.address, req.payment_details_json ? JSON.stringify(req.payment_details_json) : null]
    );
    return {
      supplier_id: req.supplier_id,
      version: res.rows[0].version
    };
  } catch (err: any) {
    throw err;
  }
}

export async function createProductSupplier(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreateProductSupplierRequest
): Promise<CreateProductSupplierResult> {
  if (!ctx.permissions.has("product.create")) {
    throw new CatalogError("PERMISSION_DENIED", "Requires product.create permission");
  }

  try {
    await executor.query(
      `INSERT INTO catalog.product_suppliers (product_id, supplier_id, supplier_sku, is_preferred, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
      [req.product_id, req.supplier_id, req.supplier_sku, req.is_preferred]
    );
    return {
      product_id: req.product_id,
      supplier_id: req.supplier_id
    };
  } catch (err: any) {
    if (err.code === "23503" && err.constraint === "product_suppliers_product_fk") {
      throw new CatalogError("ENTITY_NOT_FOUND", "Product not found", "product_id");
    }
    if (err.code === "23503" && err.constraint === "product_suppliers_supplier_fk") {
      throw new CatalogError("ENTITY_NOT_FOUND", "Supplier not found", "supplier_id");
    }
    if (err.code === "23505" && err.constraint === "product_suppliers_pkey") {
      throw new CatalogError("VALIDATION_ERROR", "Product supplier already exists");
    }
    throw err;
  }
}
