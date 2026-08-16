import { 
  ProductListQuery, 
  ProductListResponse, 
  ProductDetailResponse, 
  CreateProductRequest, 
  CreateProductResult,
  CatalogCategoryOption,
  CatalogBrandOption
} from "@kastur/contracts";

export interface CatalogGateway {
  listProducts(query: ProductListQuery): Promise<ProductListResponse>;
  getProductDetail(productId: string): Promise<ProductDetailResponse>;
  createProduct(req: CreateProductRequest): Promise<CreateProductResult>;
  listCategories(): Promise<CatalogCategoryOption[]>;
  listBrands(): Promise<CatalogBrandOption[]>;
}
