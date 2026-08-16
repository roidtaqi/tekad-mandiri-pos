import { Route, Routes } from "react-router-dom";
import { CatalogContext } from "./CatalogContext";
import { MockCatalogGateway } from "./MockCatalogGateway";
import ProductList from "./ProductList";
import AddProduct from "./AddProduct";
import ProductDetail from "./ProductDetail";
import { Surface, Stack, Text, Heading } from "@kastur/ui";

const gateway = new MockCatalogGateway();

export default function CatalogFixtureShell() {
  return (
    <CatalogContext.Provider value={gateway}>
      <main className="ks-root app-shell" aria-labelledby="app-title">
        <Surface
          className="app-shell__surface"
          elevation={1}
          padding="spacious"
        >
          <Stack align="start" gap={4}>
            <Stack gap={1}>
              <Text as="span" size="caption" tone="muted" weight="bold">
                Kastur Back Office
              </Text>
              <Heading id="app-title" level={1} size="display">
                Produk active context (DEV)
              </Heading>
            </Stack>
            
            <Routes>
              <Route path="/" element={<ProductList />} />
              <Route path="/new" element={<AddProduct />} />
              <Route path="/:productId" element={<ProductDetail />} />
            </Routes>
          </Stack>
        </Surface>
      </main>
    </CatalogContext.Provider>
  );
}
