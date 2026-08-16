import { 
  ProductListQuery, 
  ProductListResponse, 
  ProductDetailResponse, 
  CreateProductRequest, 
  CreateProductResult,
  CatalogCategoryOption,
  CatalogBrandOption,
  CatalogError
} from "@kastur/contracts";
import { CatalogGateway } from "./gateway";

const MOCK_CATEGORIES: CatalogCategoryOption[] = [
  { id: "c1", name: "Minuman" },
  { id: "c2", name: "Makanan Ringan" }
];

const MOCK_BRANDS: CatalogBrandOption[] = [
  { id: "b1", name: "Indofood" },
  { id: "b2", name: "Wings" }
];

let MOCK_PRODUCTS: any[] = [
  {
    id: "p1",
    sku: "SKU001",
    name: "Indomie Goreng",
    category: MOCK_CATEGORIES[1],
    brand: MOCK_BRANDS[0],
    base_unit_code: "PCS",
    track_inventory: true,
    status: "ACTIVE",
    version: "1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    units: [
      {
        id: "u1",
        unit_code: "PCS",
        display_name: "Pieces",
        conversion_factor: "1",
        can_sell: true,
        can_purchase: true,
        allow_decimal_qty: false,
        status: "ACTIVE",
        version: "1",
        barcodes: [
          {
            id: "bc1",
            barcode: "089686012345",
            is_internal: false,
            status: "ACTIVE",
            deactivated_at: null
          }
        ]
      },
      {
        id: "u2",
        unit_code: "DUS",
        display_name: "Karton",
        conversion_factor: "40",
        can_sell: true,
        can_purchase: true,
        allow_decimal_qty: false,
        status: "ACTIVE",
        version: "1",
        barcodes: []
      }
    ]
  }
];

export class MockCatalogGateway implements CatalogGateway {
  async listProducts(query: ProductListQuery): Promise<ProductListResponse> {
    await new Promise(r => setTimeout(r, 10)); // simulate network
    let items = [...MOCK_PRODUCTS];

    if (query.q) {
      const qLower = query.q.toLowerCase();
      const exactQ = query.q;
      items = items.filter(p => 
        p.name.toLowerCase().includes(qLower) || 
        p.sku.toLowerCase().includes(qLower) ||
        p.units.some((u: any) => u.barcodes.some((b: any) => b.barcode === exactQ))
      );
    }
    if (query.category_id) {
      items = items.filter(p => p.category.id === query.category_id);
    }
    if (query.brand_id) {
      items = items.filter(p => p.brand?.id === query.brand_id);
    }
    if (query.status) {
      items = items.filter(p => p.status === query.status);
    }
    if (query.track_inventory !== undefined) {
      items = items.filter(p => p.track_inventory === query.track_inventory);
    }

    if (query.sort === "name_asc") items.sort((a, b) => a.name.localeCompare(b.name));
    else if (query.sort === "name_desc") items.sort((a, b) => b.name.localeCompare(a.name));
    else items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = items.length;
    
    // pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    items = items.slice(offset, offset + limit);

    return { items, total };
  }

  async getProductDetail(productId: string): Promise<ProductDetailResponse> {
    await new Promise(r => setTimeout(r, 10));
    const p = MOCK_PRODUCTS.find(p => p.id === productId);
    if (!p) throw new CatalogError("ENTITY_NOT_FOUND", "Not found");
    return p;
  }

  async createProduct(req: CreateProductRequest): Promise<CreateProductResult> {
    await new Promise(r => setTimeout(r, 10));
    if (MOCK_PRODUCTS.some(p => p.sku === req.sku)) {
      throw new CatalogError("SKU_ALREADY_EXISTS", "SKU already exists", "sku");
    }
    const cat = MOCK_CATEGORIES.find(c => c.id === req.category_id);
    if (!cat) throw new CatalogError("VALIDATION_ERROR", "Invalid category", "category_id");
    const brand = req.brand_id ? MOCK_BRANDS.find(b => b.id === req.brand_id) : null;

    const newProduct = {
      id: req.product_id,
      sku: req.sku,
      name: req.name,
      category: cat,
      brand: brand || null,
      base_unit_code: req.base_unit_code,
      track_inventory: req.track_inventory,
      status: "ACTIVE",
      version: "1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      units: []
    };

    MOCK_PRODUCTS.unshift(newProduct);

    return {
      product_id: req.product_id,
      version: "1"
    };
  }

  async listCategories(): Promise<CatalogCategoryOption[]> {
    return MOCK_CATEGORIES;
  }

  async listBrands(): Promise<CatalogBrandOption[]> {
    return MOCK_BRANDS;
  }
}
