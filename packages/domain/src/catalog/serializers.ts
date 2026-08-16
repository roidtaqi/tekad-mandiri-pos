import type {
  ProductListItem,
  ProductDetailResponse,
  CatalogCategoryOption,
  CatalogBrandOption,
  PosCatalogBootstrapProduct,
  PosCatalogBootstrapProductUnit,
  PosCatalogBootstrapBarcode,
  PosCatalogBootstrapSnapshot
} from "@kastur/contracts";
import { ActorContext } from "../core/context.js";

export function serializeCatalogCategoryOption(
  ctx: ActorContext,
  row: any
): CatalogCategoryOption {
  return {
    id: row.id,
    name: row.name,
    // Future sensitive fields would use selectPermissionBoundFields here
  };
}

export function serializeCatalogBrandOption(
  ctx: ActorContext,
  row: any
): CatalogBrandOption {
  return {
    id: row.id,
    name: row.name,
  };
}

export function serializeProductListItem(
  ctx: ActorContext,
  row: any
): ProductListItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    base_unit_code: row.base_unit_code,
    track_inventory: row.track_inventory,
    status: row.status,
    version: row.version,
    category: {
      id: row.category_id,
      name: row.category_name,
    },
    brand: row.brand_id ? {
      id: row.brand_id,
      name: row.brand_name,
    } : null,
    // Add permission-bound fields here if they ever belong to the ProductListItem contract
    // ...selectPermissionBoundFields(ctx.permissions, [])
  };
}

export function serializeProductDetail(
  ctx: ActorContext,
  productRow: any,
  unitsRows: any[],
  barcodesRows: any[]
): ProductDetailResponse {
  return {
    id: productRow.id,
    sku: productRow.sku,
    name: productRow.name,
    base_unit_code: productRow.base_unit_code,
    track_inventory: productRow.track_inventory,
    status: productRow.status,
    version: productRow.version,
    created_at: productRow.created_at.toISOString(),
    updated_at: productRow.updated_at.toISOString(),
    category: {
      id: productRow.category_id,
      name: productRow.category_name,
    },
    brand: productRow.brand_id ? {
      id: productRow.brand_id,
      name: productRow.brand_name,
    } : null,
    units: unitsRows.map(u => serializeProductUnit(ctx, u, barcodesRows.filter(b => b.product_unit_id === u.id)))
  };
}

function serializeProductUnit(
  ctx: ActorContext,
  unitRow: any,
  barcodesRows: any[]
) {
  return {
    id: unitRow.id,
    unit_code: unitRow.unit_code,
    display_name: unitRow.display_name,
    conversion_factor: unitRow.conversion_factor,
    can_sell: unitRow.can_sell,
    can_purchase: unitRow.can_purchase,
    allow_decimal_qty: unitRow.allow_decimal_qty,
    status: unitRow.status,
    version: unitRow.version,
    barcodes: barcodesRows.map(b => serializeBarcode(ctx, b))
  };
}

function serializeBarcode(
  ctx: ActorContext,
  barcodeRow: any
) {
  return {
    id: barcodeRow.id,
    barcode: barcodeRow.barcode,
    is_internal: barcodeRow.is_internal,
    status: barcodeRow.status,
    deactivated_at: barcodeRow.deactivated_at ? barcodeRow.deactivated_at.toISOString() : null
  };
}

export function serializePosCatalogBootstrapProduct(
  ctx: ActorContext,
  row: any
): PosCatalogBootstrapProduct {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    base_unit_code: row.base_unit_code,
    track_inventory: row.track_inventory,
    status: row.status,
    version: row.version,
    updated_at: row.updated_at.toISOString()
  };
}

export function serializePosCatalogBootstrapProductUnit(
  ctx: ActorContext,
  row: any
): PosCatalogBootstrapProductUnit {
  return {
    id: row.id,
    product_id: row.product_id,
    unit_code: row.unit_code,
    display_name: row.display_name,
    conversion_factor: row.conversion_factor,
    can_sell: row.can_sell,
    can_purchase: row.can_purchase,
    allow_decimal_qty: row.allow_decimal_qty,
    status: row.status,
    version: row.version,
    updated_at: row.updated_at.toISOString()
  };
}

export function serializePosCatalogBootstrapBarcode(
  ctx: ActorContext,
  row: any
): PosCatalogBootstrapBarcode {
  return {
    id: row.id,
    product_unit_id: row.product_unit_id,
    barcode: row.barcode,
    is_internal: row.is_internal,
    status: row.status,
    deactivated_at: row.deactivated_at ? row.deactivated_at.toISOString() : null
  };
}

export function serializePosCatalogBootstrapSnapshot(
  ctx: ActorContext,
  serverTime: string,
  productsRows: any[],
  unitsRows: any[],
  barcodesRows: any[]
): PosCatalogBootstrapSnapshot {
  return {
    bootstrap_version: 1,
    business_id: ctx.business_id,
    server_time: serverTime,
    products: productsRows.map(p => serializePosCatalogBootstrapProduct(ctx, p)),
    product_units: unitsRows.map(u => serializePosCatalogBootstrapProductUnit(ctx, u)),
    barcodes: barcodesRows.map(b => serializePosCatalogBootstrapBarcode(ctx, b))
  };
}
