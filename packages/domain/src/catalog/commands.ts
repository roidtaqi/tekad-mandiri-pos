import { CreateProductRequest, CreateProductResult, CatalogError } from "@kastur/contracts";
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
