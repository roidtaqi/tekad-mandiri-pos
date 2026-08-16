import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { Heading, Spinner, Stack, Surface, Text } from "@kastur/ui";

const UiShowcase = import.meta.env.DEV
  ? lazy(() => import("./UiShowcase"))
  : null;

const CatalogFixtureShell = import.meta.env.DEV
  ? lazy(() => import("./features/catalog/CatalogFixtureShell"))
  : null;

const CatalogRoutes = lazy(() => import("./features/catalog/CatalogRoutes"));
import { CatalogWorkspace } from "./features/catalog/CatalogWorkspace";

function PlaceholderShell() {
  return (
    <main className="ks-root app-shell" aria-labelledby="app-title">
      <Surface
        className="app-shell__surface"
        elevation={1}
        padding="spacious"
      >
        <Stack align="center" gap={3}>
          <Text as="span" size="caption" tone="muted" weight="bold">
            Kastur Retail System
          </Text>
          <Heading id="app-title" level={1} size="display">
            Kastur Back Office
          </Heading>
          <Text tone="secondary">Fondasi aplikasi siap.</Text>
        </Stack>
      </Surface>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      {UiShowcase === null ? null : (
        <Route
          path="/__ui"
          element={
            <Suspense
              fallback={
                <main className="ks-root app-shell">
                  <Spinner label="Memuat etalase fondasi UI" />
                </main>
              }
            >
              <UiShowcase />
            </Suspense>
          }
        />
      )}
      {CatalogFixtureShell === null ? null : (
        <Route
          path="/__catalog/*"
          element={
            <Suspense
              fallback={
                <main className="ks-root app-shell">
                  <Spinner label="Memuat produk" />
                </main>
              }
            >
              <CatalogFixtureShell />
            </Suspense>
          }
        />
      )}
      <Route
        path="/products/*"
        element={
          <Suspense
            fallback={
              <main className="ks-root app-shell">
                <Spinner label="Memuat produk" />
              </main>
            }
          >
            <main className="ks-root app-shell" aria-labelledby="app-title">
              <Surface className="app-shell__surface" elevation={1} padding="spacious">
                <CatalogWorkspace authContext={null} catalogGateway={null}>
                  <CatalogRoutes />
                </CatalogWorkspace>
              </Surface>
            </main>
          </Suspense>
        }
      />
      <Route path="*" element={<PlaceholderShell />} />
    </Routes>
  );
}
