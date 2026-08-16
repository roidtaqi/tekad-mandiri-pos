import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  Button, Stack, Inline, Heading, Badge, EmptyState, Spinner, Text, Surface,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper
} from "@kastur/ui";
import { ProductDetailResponse } from "@kastur/contracts";
import { useCatalogGateway } from "./CatalogContext";

export default function ProductDetail() {
  const gateway = useCatalogGateway();
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  
  const [product, setProduct] = useState<ProductDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    gateway.getProductDetail(productId)
      .then(setProduct)
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [productId, gateway]);

  if (loading) return <Spinner label="Memuat detail produk" />;
  if (error) {
    if (error.name === "CatalogError" && error.code === "ENTITY_NOT_FOUND") {
      return <EmptyState title="Produk tidak ditemukan" description="ID produk tidak valid." />;
    }
    return <EmptyState title="Gagal memuat produk" description={error.message || "Kesalahan tidak diketahui"} />;
  }
  if (!product) return <EmptyState title="Produk tidak ditemukan" description="ID produk tidak valid." />;

  const hasBaseUnit = product.units.some(u => u.unit_code === product.base_unit_code);

  return (
    <Stack gap={5}>
      <Inline align="center" gap={4}>
        <Button variant="ghost" onClick={() => navigate(-1)}>Kembali</Button>
        <Stack gap={1}>
          <Heading level={2} size="h2">{product.name}</Heading>
          <Inline gap={2} align="center">
            <Text tone="muted">{product.sku}</Text>
            <Badge tone={product.status === "ACTIVE" ? "success" : "neutral"}>
              {product.status === "ACTIVE" ? "Aktif" : "Inaktif"}
            </Badge>
          </Inline>
        </Stack>
      </Inline>

      <Surface elevation={1} padding="spacious">
        <Stack gap={4}>
          <Heading level={3} size="h3">Ringkasan</Heading>
          <Inline gap={4} wrap>
            <Stack gap={1}>
              <Text size="caption" tone="muted" weight="bold">Kategori</Text>
              <Text>{product.category.name}</Text>
            </Stack>
            <Stack gap={1}>
              <Text size="caption" tone="muted" weight="bold">Brand</Text>
              <Text>{product.brand?.name || "-"}</Text>
            </Stack>
            <Stack gap={1}>
              <Text size="caption" tone="muted" weight="bold">Unit Dasar</Text>
              <Text>{product.base_unit_code}</Text>
            </Stack>
            <Stack gap={1}>
              <Text size="caption" tone="muted" weight="bold">Track Inventory</Text>
              <Text>{product.track_inventory ? "Ya" : "Tidak"}</Text>
            </Stack>
          </Inline>
        </Stack>
      </Surface>

      <Surface elevation={1} padding="spacious">
        <Stack gap={4}>
          <Inline justify="between" align="center">
            <Heading level={3} size="h3">Unit & Barcode</Heading>
            <Button variant="secondary" disabled>Tambah Unit</Button>
          </Inline>
          
          {!hasBaseUnit && (
            <Text tone="muted">Unit dasar belum dikonfigurasi</Text>
          )}

          <TableWrapper label="Unit dan Barcode">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Konversi</TableHead>
                  <TableHead>Can Sell</TableHead>
                  <TableHead>Can Purchase</TableHead>
                  <TableHead>Decimal Qty</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.units.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Stack gap={1}>
                        <Text>{u.unit_code} ({u.display_name})</Text>
                        {u.unit_code === product.base_unit_code && (
                          <Badge tone="info">Unit Dasar</Badge>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>1 {u.unit_code} = {u.conversion_factor} {product.base_unit_code}</TableCell>
                    <TableCell>{u.can_sell ? "Ya" : "Tidak"}</TableCell>
                    <TableCell>{u.can_purchase ? "Ya" : "Tidak"}</TableCell>
                    <TableCell>{u.allow_decimal_qty ? "Ya" : "Tidak"}</TableCell>
                    <TableCell>
                      {u.barcodes.length > 0 ? (
                        <Stack gap={1}>
                          {u.barcodes.map(b => (
                            <Text key={b.id}>{b.barcode}</Text>
                          ))}
                        </Stack>
                      ) : (
                        <Text tone="muted">-</Text>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>
                        {u.status === "ACTIVE" ? "Aktif" : "Inaktif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        </Stack>
      </Surface>

      <Surface elevation={1} padding="spacious">
        <Stack gap={2}>
          <Heading level={3} size="h3">Harga</Heading>
          <Text tone="muted">Belum tersedia pada tahap ini</Text>
        </Stack>
      </Surface>
      <Surface elevation={1} padding="spacious">
        <Stack gap={2}>
          <Heading level={3} size="h3">Stok</Heading>
          <Text tone="muted">Belum tersedia pada tahap ini</Text>
        </Stack>
      </Surface>
    </Stack>
  );
}
