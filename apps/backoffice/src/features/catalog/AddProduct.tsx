import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Button, Input, Select, Stack, Inline, Heading, Field, Surface, Alert, Checkbox, Text
} from "@kastur/ui";
import { CatalogCategoryOption, CatalogBrandOption, CatalogError } from "@kastur/contracts";
import { useCatalogGateway } from "./CatalogContext";

export default function AddProduct() {
  const gateway = useCatalogGateway();
  const navigate = useNavigate();

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [baseUnitCode, setBaseUnitCode] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);

  const [categories, setCategories] = useState<CatalogCategoryOption[]>([]);
  const [brands, setBrands] = useState<CatalogBrandOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    gateway.listCategories().then(setCategories).catch(console.error);
    gateway.listBrands().then(setBrands).catch(console.error);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await gateway.createProduct({
        product_id: crypto.randomUUID(),
        sku,
        name,
        category_id: categoryId,
        brand_id: brandId || null,
        base_unit_code: baseUnitCode,
        track_inventory: trackInventory
      });
      navigate(`/products/${result.product_id}`);
    } catch (err: any) {
      if (err.name === "CatalogError") {
        const cErr = err as CatalogError;
        if (cErr.field) {
          setFieldErrors({ [cErr.field]: cErr.message });
        } else {
          setError(cErr.message);
        }
      } else {
        setError(err.message || "Failed to save product");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap={4}>
      <Inline align="center">
        <Button variant="ghost" onClick={() => navigate(-1)}>Kembali</Button>
        <Heading level={2} size="h2">Tambah Produk</Heading>
      </Inline>

      {error && <Alert title="Gagal menyimpan" severity="CRITICAL"><Text>{error}</Text></Alert>}

      <Surface elevation={1} padding="spacious">
        <form onSubmit={handleSubmit}>
          <Stack gap={4}>
            <Field label="Nama Produk" required error={fieldErrors.name}>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </Field>
            <Field label="SKU" required error={fieldErrors.sku}>
              <Input value={sku} onChange={e => setSku(e.target.value)} required />
            </Field>
            <Field label="Kategori" required error={fieldErrors.category_id}>
              <Select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                <option value="" disabled>Pilih Kategori</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Brand (Opsional)" error={fieldErrors.brand_id}>
              <Select value={brandId} onChange={e => setBrandId(e.target.value)}>
                <option value="">Tidak ada brand</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Base Unit (Kode Unit Dasar)" required error={fieldErrors.base_unit_code}>
              <Input value={baseUnitCode} onChange={e => setBaseUnitCode(e.target.value)} required placeholder="Contoh: PCS, BOX" />
            </Field>
            <Field label="Track Inventory" error={fieldErrors.track_inventory}>
              <Checkbox 
                label="Lacak stok untuk produk ini"
                checked={trackInventory} 
                onChange={e => setTrackInventory(e.target.checked)} 
              />
            </Field>

            <Inline justify="end" gap={2}>
              <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Batal</Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </Inline>
          </Stack>
        </form>
      </Surface>
    </Stack>
  );
}
