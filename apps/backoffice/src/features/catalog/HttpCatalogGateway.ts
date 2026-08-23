import {
  CatalogError,
  type CatalogBrandOption,
  type CatalogCategoryOption,
  type CatalogErrorCode,
  type CreateProductRequest,
  type CreateProductResult,
  type ProductDetailResponse,
  type ProductListQuery,
  type ProductListResponse,
} from "@kastur/contracts";

import { AuthenticatedHttpClient, HttpError } from "../../runtime/http";
import type { CatalogGateway } from "./gateway";

const catalogErrorCodes = new Set<CatalogErrorCode>([
  "ENTITY_NOT_FOUND",
  "PERMISSION_DENIED",
  "SKU_ALREADY_EXISTS",
  "VALIDATION_ERROR",
  "VERSION_CONFLICT",
]);

function mapCatalogError(error: unknown): never {
  if (error instanceof HttpError && catalogErrorCodes.has(error.code as CatalogErrorCode)) {
    const field = typeof error.details?.field === "string" ? error.details.field : undefined;
    throw new CatalogError(error.code as CatalogErrorCode, error.message, field);
  }
  throw error;
}

function productListPath(query: ProductListQuery): string {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set("q", query.q);
  if (query.category_id !== undefined) params.set("category_id", query.category_id);
  if (query.brand_id !== undefined) params.set("brand_id", query.brand_id);
  if (query.status !== undefined) params.set("status", query.status);
  if (query.track_inventory !== undefined) {
    params.set("track_inventory", String(query.track_inventory));
  }
  if (query.sort !== undefined) params.set("sort", query.sort);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const suffix = params.toString();
  return suffix.length === 0 ? "/api/v1/catalog/products" : `/api/v1/catalog/products?${suffix}`;
}

export class HttpCatalogGateway implements CatalogGateway {
  constructor(private readonly client: AuthenticatedHttpClient) {}

  async listProducts(query: ProductListQuery): Promise<ProductListResponse> {
    try {
      return await this.client.get<ProductListResponse>(productListPath(query));
    } catch (error: unknown) {
      return mapCatalogError(error);
    }
  }

  async getProductDetail(productId: string): Promise<ProductDetailResponse> {
    try {
      return await this.client.get<ProductDetailResponse>(
        `/api/v1/catalog/products/${encodeURIComponent(productId)}`,
      );
    } catch (error: unknown) {
      return mapCatalogError(error);
    }
  }

  async createProduct(request: CreateProductRequest): Promise<CreateProductResult> {
    try {
      return await this.client.post<CreateProductResult>(
        "/api/v1/catalog/products",
        request,
        {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Correlation-Id": crypto.randomUUID(),
        },
      );
    } catch (error: unknown) {
      return mapCatalogError(error);
    }
  }

  async listCategories(): Promise<CatalogCategoryOption[]> {
    try {
      const result = await this.client.get<readonly CatalogCategoryOption[]>(
        "/api/v1/catalog/categories",
      );
      return [...result];
    } catch (error: unknown) {
      return mapCatalogError(error);
    }
  }

  async listBrands(): Promise<CatalogBrandOption[]> {
    try {
      const result = await this.client.get<readonly CatalogBrandOption[]>(
        "/api/v1/catalog/brands",
      );
      return [...result];
    } catch (error: unknown) {
      return mapCatalogError(error);
    }
  }
}
