import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Button, 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper,
  Input, Select, Stack, Inline, Heading, Badge, EmptyState, Spinner, Text
} from "@kastur/ui";
import { ProductListItem, CatalogCategoryOption, CatalogBrandOption, ProductListQuery } from "@kastur/contracts";
import { useCatalogGateway } from "./CatalogContext";

export default function ProductList() {
  const gateway = useCatalogGateway();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<CatalogCategoryOption[]>([]);
  const [brands, setBrands] = useState<CatalogBrandOption[]>([]);

  // We pretend user has create permission for UI showcase
  const canCreate = true;

  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("category_id") || "";
  const brandId = searchParams.get("brand_id") || "";
  const status = searchParams.get("status") || "";
  const trackInventory = searchParams.get("track_inventory") || "";
  const sort = searchParams.get("sort") || "created_at_desc";

  useEffect(() => {
    gateway.listCategories().then(setCategories).catch(console.error);
    gateway.listBrands().then(setBrands).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const payload: any = {};
    if (q) payload.q = q;
    if (categoryId) payload.category_id = categoryId;
    if (brandId) payload.brand_id = brandId;
    if (status) payload.status = status as "ACTIVE" | "INACTIVE";
    if (trackInventory) payload.track_inventory = trackInventory === "true";
    if (sort) payload.sort = sort as "name_asc" | "name_desc" | "created_at_desc";

    gateway.listProducts(payload as ProductListQuery)
      .then(res => {
        setItems([...res.items]);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, categoryId, brandId, status, trackInventory, sort]);

  function updateParam(key: string, value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  }

  return (
    <Stack gap={4}>
      <Inline align="center" justify="between">
        <Heading level={2} size="h2">Produk</Heading>
        {canCreate && (
          <Button onClick={() => navigate("/products/new")}>
            Tambah Produk
          </Button>
        )}
      </Inline>

      <Inline gap={2} wrap>
        <Input 
          placeholder="Nama, SKU, atau Barcode" 
          value={q}
          onChange={e => updateParam("q", e.target.value)}
        />
        <Select 
          value={categoryId} 
          onChange={e => updateParam("category_id", e.target.value)}
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select 
          value={brandId} 
          onChange={e => updateParam("brand_id", e.target.value)}
        >
          <option value="">Semua Brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select 
          value={status} 
          onChange={e => updateParam("status", e.target.value)}
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Inaktif</option>
        </Select>
        <Select 
          value={trackInventory} 
          onChange={e => updateParam("track_inventory", e.target.value)}
        >
          <option value="">Track Inventory: Semua</option>
          <option value="true">Ya</option>
          <option value="false">Tidak</option>
        </Select>
      </Inline>

      {loading ? (
        <Spinner label="Memuat produk" />
      ) : error ? (
        <EmptyState title="Gagal memuat produk" description={error} />
      ) : items.length === 0 ? (
        <EmptyState 
          title="Tidak ada produk" 
          description={q ? "Pencarian tidak menemukan hasil." : "Belum ada produk yang ditambahkan."} 
        />
      ) : (
        <TableWrapper label="Daftar Produk">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Unit Dasar</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(p => (
                <TableRow key={p.id} onClick={() => navigate(`/products/${p.id}`)} style={{ cursor: "pointer" }}>
                  <TableCell>
                    <Text weight="medium">{p.name}</Text>
                    {p.track_inventory && <Text size="caption" tone="muted">Track Inventory</Text>}
                  </TableCell>
                  <TableCell>{p.sku}</TableCell>
                  <TableCell>{p.category.name}</TableCell>
                  <TableCell>{p.brand?.name || "-"}</TableCell>
                  <TableCell>{p.base_unit_code}</TableCell>
                  <TableCell>
                    <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>
                      {p.status === "ACTIVE" ? "Aktif" : "Inaktif"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      )}
    </Stack>
  );
}
