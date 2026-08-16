import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Button, 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper,
  Input, Select, Stack, Inline, Heading, Badge, EmptyState, Spinner, Text
} from "@kastur/ui";
import { ProductListItem, CatalogCategoryOption, CatalogBrandOption, ProductListQuery } from "@kastur/contracts";
import { useCatalogGateway } from "./CatalogContext";
import { useAuthContext } from "../auth/AuthContext";
import { hasCachedPermission } from "@kastur/auth-client";
import styles from "./ProductList.module.css";

export default function ProductList() {
  const gateway = useCatalogGateway();
  const authContext = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<CatalogCategoryOption[]>([]);
  const [brands, setBrands] = useState<CatalogBrandOption[]>([]);

  // URL state parameters
  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("category") || "";
  const brandId = searchParams.get("brand") || "";
  const status = searchParams.get("status") || "";
  const trackInventory = searchParams.get("track_inventory") || "";
  const sort = searchParams.get("sort") || "created_at_desc";

  const canCreate = hasCachedPermission(authContext, "product.create");

  useEffect(() => {
    gateway.listCategories().then(setCategories).catch(() => {
      setError("Gagal memuat daftar kategori. Silakan muat ulang halaman.");
    });
    gateway.listBrands().then(setBrands).catch(() => {
      setError("Gagal memuat daftar brand. Silakan muat ulang halaman.");
    });
  }, [gateway]);

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
          aria-label="Cari produk"
          placeholder="Nama, SKU, atau Barcode" 
          value={q}
          onChange={e => updateParam("q", e.target.value)}
        />
        <Select 
          aria-label="Filter kategori"
          value={categoryId} 
          onChange={e => updateParam("category", e.target.value)}
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select 
          aria-label="Filter brand"
          value={brandId} 
          onChange={e => updateParam("brand", e.target.value)}
        >
          <option value="">Semua Brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select 
          aria-label="Filter status"
          value={status} 
          onChange={e => updateParam("status", e.target.value)}
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Inaktif</option>
        </Select>
        <Select 
          aria-label="Filter lacak stok"
          value={trackInventory} 
          onChange={e => updateParam("track_inventory", e.target.value)}
        >
          <option value="">Track Inventory: Semua</option>
          <option value="true">Ya</option>
          <option value="false">Tidak</option>
        </Select>
        <Select 
          aria-label="Urutkan"
          value={sort} 
          onChange={e => updateParam("sort", e.target.value)}
        >
          <option value="created_at_desc">Terbaru</option>
          <option value="name_asc">Nama (A-Z)</option>
          <option value="name_desc">Nama (Z-A)</option>
        </Select>
      </Inline>

      {loading ? (
        <Spinner label="Memuat produk" />
      ) : error ? (
        <EmptyState title="Gagal memuat produk" description={error} />
      ) : items.length === 0 ? (
        q || categoryId || brandId || status || trackInventory ? (
          <EmptyState 
            title="Tidak ada hasil" 
            description="Pencarian tidak menemukan hasil."
            action={
              <Button variant="secondary" onClick={() => setSearchParams(new URLSearchParams())}>Reset Filter</Button>
            }
          />
        ) : (
          <EmptyState 
            title="Tidak ada produk" 
            description="Belum ada produk yang ditambahkan." 
            action={canCreate ? <Button onClick={() => navigate("/products/new")}>Tambah Produk</Button> : undefined}
          />
        )
      ) : (
        <div className="ks-root">
          <div className={styles.desktopTable}>
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
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Stack gap={1}>
                          <Text weight="medium">{p.name}</Text>
                          {p.track_inventory && <Text size="caption" tone="muted">Track Inventory</Text>}
                        </Stack>
                      </TableCell>
                      <TableCell>{p.sku}</TableCell>
                      <TableCell>{p.category.name}</TableCell>
                      <TableCell>{p.brand?.name || "-"}</TableCell>
                      <TableCell>{p.base_unit_code}</TableCell>
                      <TableCell>
                        <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>
                          <span className="ks-visually-hidden">Status: </span>
                          {p.status === "ACTIVE" ? "Aktif" : "Inaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="compact" onClick={() => navigate(`/products/${p.id}`)}>Detail</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>
          <div className={styles.mobileList}>
            {items.map(p => (
              <Stack gap={2} key={p.id} className="mobile-product-card" style={{ padding: '1rem', border: '1px solid var(--ks-color-border-subtle)', borderRadius: 'var(--ks-radius-medium)' }}>
                <Inline justify="between" align="start">
                  <Stack gap={1}>
                    <Text weight="medium">{p.name}</Text>
                    <Text size="caption" tone="muted">{p.sku}</Text>
                  </Stack>
                  <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>
                    <span className="ks-visually-hidden">Status: </span>
                    {p.status === "ACTIVE" ? "Aktif" : "Inaktif"}
                  </Badge>
                </Inline>
                <Inline justify="between" align="center">
                  <Text size="caption" tone="muted">{p.category.name}</Text>
                  <Button variant="ghost" size="compact" onClick={() => navigate(`/products/${p.id}`)}>Detail</Button>
                </Inline>
              </Stack>
            ))}
          </div>
        </div>
      )}
    </Stack>
  );
}
