export interface CatalogCategoryOption {
  readonly id: string;
  readonly name: string;
}

export interface CatalogBrandOption {
  readonly id: string;
  readonly name: string;
}

export interface ProductListItem {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly category: CatalogCategoryOption;
  readonly brand: CatalogBrandOption | null;
  readonly base_unit_code: string;
  readonly track_inventory: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
}

export interface ProductListQuery {
  readonly q?: string;
  readonly category_id?: string;
  readonly brand_id?: string;
  readonly status?: "ACTIVE" | "INACTIVE";
  readonly track_inventory?: boolean;
  readonly sort?: "name_asc" | "name_desc" | "created_at_desc";
  readonly limit?: number;
  readonly offset?: number;
}

export interface ProductListResponse {
  readonly items: readonly ProductListItem[];
  readonly total: number;
}

export interface ProductUnitDto {
  readonly id: string;
  readonly unit_code: string;
  readonly display_name: string;
  readonly conversion_factor: string;
  readonly can_sell: boolean;
  readonly can_purchase: boolean;
  readonly allow_decimal_qty: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
}

export interface BarcodeDto {
  readonly id: string;
  readonly barcode: string;
  readonly is_internal: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly deactivated_at: string | null;
}

export interface ProductUnitWithBarcodesDto extends ProductUnitDto {
  readonly barcodes: readonly BarcodeDto[];
}

export interface ProductDetailResponse {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly category: CatalogCategoryOption;
  readonly brand: CatalogBrandOption | null;
  readonly base_unit_code: string;
  readonly track_inventory: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly units: readonly ProductUnitWithBarcodesDto[];
}

export interface CreateProductRequest {
  readonly product_id: string;
  readonly sku: string;
  readonly name: string;
  readonly category_id: string;
  readonly brand_id: string | null;
  readonly base_unit_code: string;
  readonly track_inventory: boolean;
}

export interface CreateProductResult {
  readonly product_id: string;
  readonly version: string;
}

export type CatalogErrorCode =
  | "SKU_ALREADY_EXISTS"
  | "ENTITY_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PERMISSION_DENIED"
  | "VERSION_CONFLICT";

export class CatalogError extends Error {
  constructor(
    public readonly code: CatalogErrorCode,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

export interface SupplierDTO {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly payment_details_json: Record<string, unknown> | null;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: string;
}

export interface ProductSupplierDTO {
  readonly product_id: string;
  readonly supplier_id: string;
  readonly supplier_sku: string | null;
  readonly is_preferred: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly created_at: string;
}

export interface CreateSupplierRequest {
  readonly supplier_id: string;
  readonly name: string;
  readonly code: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly payment_details_json: Record<string, unknown> | null;
}

export interface CreateProductSupplierRequest {
  readonly product_id: string;
  readonly supplier_id: string;
  readonly supplier_sku: string | null;
  readonly is_preferred: boolean;
}

export interface CreateSupplierResult {
  readonly supplier_id: string;
  readonly version: string;
}

export interface CreateProductSupplierResult {
  readonly product_id: string;
  readonly supplier_id: string;
}
