import type {
  BarcodeDto,
  CatalogBrandOption,
  CatalogCategoryOption,
  CreateProductRequest,
  CreateProductResult,
  ProductDetailResponse,
  ProductListItem,
  ProductListQuery,
  ProductListResponse,
  ProductUnitWithBarcodesDto,
} from "@kastur/contracts";

import {
  appendAuditEvent,
  appendChange,
  executeIdempotent,
  type CommandIdentity,
} from "./command-support.js";
import type { AuthenticatedRequestContext } from "./auth.js";
import { requirePermission } from "./auth.js";
import type { RequestDatabase, SqlExecutor } from "./database.js";
import { ApiError, readJsonObject, requireString } from "./http.js";

interface ProductListRow {
  readonly base_unit_code: string;
  readonly brand_id: string | null;
  readonly brand_name: string | null;
  readonly category_id: string;
  readonly category_name: string;
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly track_inventory: boolean;
  readonly version: string;
}

interface ProductDetailRow extends ProductListRow {
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface ProductUnitRow {
  readonly allow_decimal_qty: boolean;
  readonly can_purchase: boolean;
  readonly can_sell: boolean;
  readonly conversion_factor: string;
  readonly display_name: string;
  readonly id: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly unit_code: string;
  readonly version: string;
}

interface BarcodeRow {
  readonly barcode: string;
  readonly deactivated_at: Date | string | null;
  readonly id: string;
  readonly is_internal: boolean;
  readonly product_unit_id: string;
  readonly status: "ACTIVE" | "INACTIVE";
}

interface OptionRow {
  readonly id: string;
  readonly name: string;
}

interface CountRow {
  readonly total: string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function serializeProduct(row: ProductListRow): ProductListItem {
  return {
    base_unit_code: row.base_unit_code,
    brand:
      row.brand_id === null || row.brand_name === null
        ? null
        : { id: row.brand_id, name: row.brand_name },
    category: { id: row.category_id, name: row.category_name },
    id: row.id,
    name: row.name,
    sku: row.sku,
    status: row.status,
    track_inventory: row.track_inventory,
    version: row.version,
  };
}

function requireUuid(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      text,
    )
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} harus berupa UUID.`, {
      field,
    });
  }
  return text;
}

function readProductQuery(url: URL): ProductListQuery {
  const q = url.searchParams.get("q");
  const categoryId = url.searchParams.get("category_id");
  const brandId = url.searchParams.get("brand_id");
  const status = url.searchParams.get("status");
  const trackInventory = url.searchParams.get("track_inventory");
  const sort = url.searchParams.get("sort");
  const limitText = url.searchParams.get("limit");
  const offsetText = url.searchParams.get("offset");

  if (status !== null && status !== "ACTIVE" && status !== "INACTIVE") {
    throw new ApiError(400, "VALIDATION_ERROR", "Status produk tidak valid.");
  }
  if (
    sort !== null &&
    sort !== "name_asc" &&
    sort !== "name_desc" &&
    sort !== "created_at_desc"
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Urutan produk tidak valid.");
  }
  if (trackInventory !== null && trackInventory !== "true" && trackInventory !== "false") {
    throw new ApiError(400, "VALIDATION_ERROR", "Filter persediaan tidak valid.");
  }

  const parsePage = (value: string | null, fallback: number, maximum: number) => {
    if (value === null) return fallback;
    if (!/^[0-9]+$/u.test(value)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Parameter halaman tidak valid.");
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
      throw new ApiError(400, "VALIDATION_ERROR", "Parameter halaman di luar batas.");
    }
    return parsed;
  };

  return {
    ...(q === null ? {} : { q }),
    ...(categoryId === null ? {} : { category_id: categoryId }),
    ...(brandId === null ? {} : { brand_id: brandId }),
    ...(status === null ? {} : { status }),
    ...(trackInventory === null
      ? {}
      : { track_inventory: trackInventory === "true" }),
    ...(sort === null ? {} : { sort }),
    limit: parsePage(limitText, 50, 100),
    offset: parsePage(offsetText, 0, 1_000_000),
  };
}

export async function listProducts(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  url: URL,
): Promise<ProductListResponse> {
  requirePermission(context, "product.read");
  const query = readProductQuery(url);
  const conditions = ["p.business_id = $1"];
  const values: unknown[] = [context.authorization.membership.business_id];

  if (query.q !== undefined && query.q.trim().length > 0) {
    values.push(`%${query.q.trim()}%`);
    const searchIndex = values.length;
    values.push(query.q.trim());
    const exactIndex = values.length;
    conditions.push(`(
      p.name ILIKE $${searchIndex}
      OR p.sku ILIKE $${searchIndex}
      OR EXISTS (
        SELECT 1
        FROM catalog.product_units search_unit
        JOIN catalog.barcodes search_barcode
          ON search_barcode.product_unit_id = search_unit.id
        WHERE search_unit.business_id = p.business_id
          AND search_unit.product_id = p.id
          AND search_barcode.status = 'ACTIVE'
          AND search_barcode.barcode = $${exactIndex}
      )
    )`);
  }

  for (const [column, value] of [
    ["p.category_id", query.category_id],
    ["p.brand_id", query.brand_id],
    ["p.status", query.status],
    ["p.track_inventory", query.track_inventory],
  ] as const) {
    if (value !== undefined) {
      values.push(value);
      conditions.push(`${column} = $${values.length}`);
    }
  }

  const where = conditions.join(" AND ");
  const orderBy =
    query.sort === "name_asc"
      ? "p.name ASC, p.id ASC"
      : query.sort === "name_desc"
        ? "p.name DESC, p.id ASC"
        : "p.created_at DESC, p.id ASC";
  const count = await executor.query<CountRow>(
    `SELECT count(*)::text AS total FROM catalog.products p WHERE ${where}`,
    values,
  );
  values.push(query.limit ?? 50, query.offset ?? 0);
  const rows = await executor.query<ProductListRow>(
    `SELECT p.id, p.sku, p.name, p.base_unit_code, p.track_inventory,
            p.status, p.version::text, c.id AS category_id,
            c.name AS category_name, b.id AS brand_id, b.name AS brand_name
     FROM catalog.products p
     JOIN catalog.categories c
       ON c.business_id = p.business_id AND c.id = p.category_id
     LEFT JOIN catalog.brands b
       ON b.business_id = p.business_id AND b.id = p.brand_id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return {
    items: rows.rows.map(serializeProduct),
    total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
  };
}

export async function getProduct(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  productId: string,
): Promise<ProductDetailResponse> {
  requirePermission(context, "product.read");
  requireUuid(productId, "product_id");
  const products = await executor.query<ProductDetailRow>(
    `SELECT p.id, p.sku, p.name, p.base_unit_code, p.track_inventory,
            p.status, p.version::text, p.created_at, p.updated_at,
            c.id AS category_id, c.name AS category_name,
            b.id AS brand_id, b.name AS brand_name
     FROM catalog.products p
     JOIN catalog.categories c
       ON c.business_id = p.business_id AND c.id = p.category_id
     LEFT JOIN catalog.brands b
       ON b.business_id = p.business_id AND b.id = p.brand_id
     WHERE p.business_id = $1 AND p.id = $2`,
    [context.authorization.membership.business_id, productId],
  );
  const product = products.rows[0];
  if (product === undefined) {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Produk tidak ditemukan.");
  }

  const [units, barcodes] = await Promise.all([
    executor.query<ProductUnitRow>(
      `SELECT id, unit_code, display_name, conversion_factor::text,
              can_sell, can_purchase, allow_decimal_qty, status, version::text
       FROM catalog.product_units
       WHERE business_id = $1 AND product_id = $2
       ORDER BY created_at ASC, id ASC`,
      [context.authorization.membership.business_id, productId],
    ),
    executor.query<BarcodeRow>(
      `SELECT b.id, b.product_unit_id, b.barcode, b.is_internal,
              b.status, b.deactivated_at
       FROM catalog.barcodes b
       JOIN catalog.product_units pu
         ON pu.business_id = b.business_id AND pu.id = b.product_unit_id
       WHERE b.business_id = $1 AND pu.product_id = $2
       ORDER BY b.created_at ASC, b.id ASC`,
      [context.authorization.membership.business_id, productId],
    ),
  ]);

  const barcodesByUnit = new Map<string, BarcodeDto[]>();
  for (const barcode of barcodes.rows) {
    const item: BarcodeDto = {
      barcode: barcode.barcode,
      deactivated_at: nullableIso(barcode.deactivated_at),
      id: barcode.id,
      is_internal: barcode.is_internal,
      status: barcode.status,
    };
    const group = barcodesByUnit.get(barcode.product_unit_id) ?? [];
    group.push(item);
    barcodesByUnit.set(barcode.product_unit_id, group);
  }

  const serializedUnits: ProductUnitWithBarcodesDto[] = units.rows.map((unit) => ({
    allow_decimal_qty: unit.allow_decimal_qty,
    barcodes: barcodesByUnit.get(unit.id) ?? [],
    can_purchase: unit.can_purchase,
    can_sell: unit.can_sell,
    conversion_factor: unit.conversion_factor,
    display_name: unit.display_name,
    id: unit.id,
    status: unit.status,
    unit_code: unit.unit_code,
    version: unit.version,
  }));

  return {
    ...serializeProduct(product),
    created_at: iso(product.created_at),
    units: serializedUnits,
    updated_at: iso(product.updated_at),
  };
}

export async function listCatalogOptions(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  type: "brands" | "categories",
): Promise<readonly CatalogBrandOption[] | readonly CatalogCategoryOption[]> {
  requirePermission(context, "product.read");
  const table = type === "brands" ? "catalog.brands" : "catalog.categories";
  const result = await executor.query<OptionRow>(
    `SELECT id, name FROM ${table}
     WHERE business_id = $1 AND status = 'ACTIVE'
     ORDER BY name ASC, id ASC`,
    [context.authorization.membership.business_id],
  );
  return result.rows.map((row) => ({ id: row.id, name: row.name }));
}

function readCreateProduct(body: Record<string, unknown>): CreateProductRequest {
  const brandId = body.brand_id;
  if (brandId !== null && brandId !== undefined && typeof brandId !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", "brand_id tidak valid.", {
      field: "brand_id",
    });
  }
  if (typeof body.track_inventory !== "boolean") {
    throw new ApiError(400, "VALIDATION_ERROR", "track_inventory wajib boolean.", {
      field: "track_inventory",
    });
  }
  return {
    base_unit_code: requireString(body.base_unit_code, "base_unit_code").trim(),
    brand_id:
      brandId === null || brandId === undefined
        ? null
        : requireUuid(brandId, "brand_id"),
    category_id: requireUuid(body.category_id, "category_id"),
    name: requireString(body.name, "name").trim(),
    product_id: requireUuid(body.product_id, "product_id"),
    sku: requireString(body.sku, "sku").trim(),
    track_inventory: body.track_inventory,
  };
}

function databaseErrorDetails(error: unknown): {
  readonly code?: string;
  readonly constraint?: string;
} {
  if (typeof error !== "object" || error === null) return {};
  const record = error as Record<string, unknown>;
  return {
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.constraint === "string"
      ? { constraint: record.constraint }
      : {}),
  };
}

export async function createProduct(
  request: Request,
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
): Promise<CreateProductResult> {
  requirePermission(context, "product.create");
  const product = readCreateProduct(await readJsonObject(request));
  const commandId = request.headers.get("idempotency-key");
  if (commandId === null) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Header Idempotency-Key wajib diisi.",
    );
  }
  requireUuid(commandId, "Idempotency-Key");
  const occurredAt = new Date().toISOString();
  const command: CommandIdentity = {
    command_id: commandId,
    command_type: "catalog.product.create",
    correlation_id: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    location_id: null,
    occurred_at: occurredAt,
  };

  const outcome = await executeIdempotent(
    database,
    context,
    command,
    product,
    async (executor) => {
      let inserted;
      try {
        inserted = await executor.query<{ readonly version: string }>(
          `INSERT INTO catalog.products (
             id, business_id, sku, name, category_id, brand_id,
             base_unit_code, track_inventory, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
           RETURNING version::text`,
          [
            product.product_id,
            context.authorization.membership.business_id,
            product.sku,
            product.name,
            product.category_id,
            product.brand_id,
            product.base_unit_code,
            product.track_inventory,
          ],
        );
      } catch (error: unknown) {
        const details = databaseErrorDetails(error);
        if (details.code === "23505") {
          throw new ApiError(409, "SKU_ALREADY_EXISTS", "SKU sudah digunakan.");
        }
        if (details.code === "23503") {
          throw new ApiError(
            404,
            "ENTITY_NOT_FOUND",
            "Kategori atau merek tidak ditemukan dalam bisnis ini.",
          );
        }
        throw error;
      }

      const result: CreateProductResult = {
        product_id: product.product_id,
        version: inserted.rows[0]?.version ?? "1",
      };
      await appendAuditEvent(executor, context, command, {
        action: "PRODUCT_CREATED",
        after_data: product,
        entity_id: product.product_id,
        entity_type: "product",
      });
      await appendChange(executor, context, command, {
        change_type: "UPSERT",
        entity_id: product.product_id,
        entity_type: "product",
        entity_version: result.version,
        payload: result,
      });
      return result;
    },
    // The catalog HTTP route assigns audit time/correlation server-side. They
    // must not make an otherwise identical retry change its request fingerprint.
    {
      command_id: command.command_id,
      command_type: command.command_type,
      payload: product,
    },
  );

  return outcome.result;
}
