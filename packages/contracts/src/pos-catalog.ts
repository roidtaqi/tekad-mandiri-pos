export interface PosCatalogBootstrapProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly base_unit_code: string;
  readonly track_inventory: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
  readonly updated_at: string;
}

export interface PosCatalogBootstrapProductUnit {
  readonly id: string;
  readonly product_id: string;
  readonly unit_code: string;
  readonly display_name: string;
  readonly conversion_factor: string;
  readonly can_sell: boolean;
  readonly can_purchase: boolean;
  readonly allow_decimal_qty: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
  readonly updated_at: string;
}

export interface PosCatalogBootstrapBarcode {
  readonly id: string;
  readonly product_unit_id: string;
  readonly barcode: string;
  readonly is_internal: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly deactivated_at: string | null;
}

export interface PosCatalogBootstrapSnapshot {
  readonly bootstrap_version: 1;
  readonly business_id: string;
  readonly server_time: string;
  readonly products: readonly PosCatalogBootstrapProduct[];
  readonly product_units: readonly PosCatalogBootstrapProductUnit[];
  readonly barcodes: readonly PosCatalogBootstrapBarcode[];
}
