import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@kastur/ui";

import { Layout } from "./features/Layout";
import {
  BackofficeCompositionRoot,
  type BackofficeRuntimeOptions,
} from "./runtime/CompositionRoot";

const UiShowcase = import.meta.env.DEV ? lazy(() => import("./UiShowcase")) : null;
const CatalogFixtureShell = import.meta.env.DEV
  ? lazy(() => import("./features/catalog/CatalogFixtureShell"))
  : null;
const CatalogRouteEntry = lazy(() => import("./features/catalog/CatalogRouteEntry"));
const NotFoundPage = lazy(async () => ({
  default: (await import("./features/resources/NotFoundPage")).NotFoundPage,
}));
const OverviewPage = lazy(async () => ({
  default: (await import("./features/resources/OverviewPage")).OverviewPage,
}));
const ResourcePage = lazy(async () => ({
  default: (await import("./features/resources/ResourcePage")).ResourcePage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import("./features/resources/SettingsPage")).SettingsPage,
}));
const PurchasingIndexPage = lazy(async () => ({ default: (await import("./features/operations/PurchasingOperations")).PurchasingIndexPage }));
const PurchaseCreatePage = lazy(async () => ({ default: (await import("./features/operations/PurchasingOperations")).PurchaseCreatePage }));
const PurchaseReceivePage = lazy(async () => ({ default: (await import("./features/operations/PurchasingOperations")).PurchaseReceivePage }));
const PurchaseInvoicePage = lazy(async () => ({ default: (await import("./features/operations/PurchasingOperations")).PurchaseInvoicePage }));
const PurchasePostPage = lazy(async () => ({ default: (await import("./features/operations/PurchasingOperations")).PurchasePostPage }));
const PricingIndexPage = lazy(async () => ({ default: (await import("./features/operations/PricingOperations")).PricingIndexPage }));
const PriceProposalCreatePage = lazy(async () => ({ default: (await import("./features/operations/PricingOperations")).PriceProposalCreatePage }));
const PriceProposalSubmitPage = lazy(async () => ({ default: (await import("./features/operations/PricingOperations")).PriceProposalSubmitPage }));
const PriceProposalApprovePage = lazy(async () => ({ default: (await import("./features/operations/PricingOperations")).PriceProposalApprovePage }));
const PromotionPublishPage = lazy(async () => ({ default: (await import("./features/operations/PricingOperations")).PromotionPublishPage }));
const InventoryIndexPage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).InventoryIndexPage }));
const InventoryAdjustmentPage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).InventoryAdjustmentPage }));
const OpnameCreatePage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).OpnameCreatePage }));
const OpnameCountPage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).OpnameCountPage }));
const OpnameRecountPage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).OpnameRecountPage }));
const OpnameReviewPage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).OpnameReviewPage }));
const OpnamePostPage = lazy(async () => ({ default: (await import("./features/operations/InventoryOperations")).OpnamePostPage }));
const ReturnsIndexPage = lazy(async () => ({ default: (await import("./features/operations/RefundOperations")).ReturnsIndexPage }));
const RefundRetryPage = lazy(async () => ({ default: (await import("./features/operations/RefundOperations")).RefundRetryPage }));
const RefundResolvePage = lazy(async () => ({ default: (await import("./features/operations/RefundOperations")).RefundResolvePage }));
const RefundReversePage = lazy(async () => ({ default: (await import("./features/operations/RefundOperations")).RefundReversePage }));

export interface AppProps {
  readonly runtimeOptions?: BackofficeRuntimeOptions;
}

function LoadingScreen({ label }: { readonly label: string }) {
  return (
    <main className="ks-root session-screen">
      <Spinner label={label} />
    </main>
  );
}

function RouteLoading({ label }: { readonly label: string }) {
  return (
    <div className="resource-state">
      <Spinner label={label} />
    </div>
  );
}

function lazyRoute(element: ReactNode, label: string) {
  return (
    <Suspense fallback={<RouteLoading label={label} />}>
      {element}
    </Suspense>
  );
}

export function App({ runtimeOptions }: AppProps) {
  return (
    <Routes>
      {UiShowcase === null ? null : (
        <Route
          element={
            <Suspense fallback={<LoadingScreen label="Memuat etalase fondasi UI" />}>
              <UiShowcase />
            </Suspense>
          }
          path="/__ui"
        />
      )}
      {CatalogFixtureShell === null ? null : (
        <Route
          element={
            <Suspense fallback={<LoadingScreen label="Memuat fixture katalog" />}>
              <CatalogFixtureShell />
            </Suspense>
          }
          path="/__catalog/*"
        />
      )}
      <Route
        element={
          <BackofficeCompositionRoot
            {...(runtimeOptions === undefined ? {} : { options: runtimeOptions })}
          >
            <ProductionRoutes />
          </BackofficeCompositionRoot>
        }
        path="*"
      />
    </Routes>
  );
}

function ProductionRoutes() {
  return (
    <Routes>
      <Route element={<Layout />} path="/">
        <Route element={<Navigate replace to="/dashboard" />} index />
        <Route element={lazyRoute(<OverviewPage />, "Memuat ringkasan")} path="dashboard" />
        <Route element={lazyRoute(<ResourcePage page="attention" />, "Memuat perhatian")} path="review" />
        <Route
          element={lazyRoute(<CatalogRouteEntry />, "Memuat produk")}
          path="products/*"
        />
        <Route element={lazyRoute(<PurchasingIndexPage />, "Memuat purchasing")} path="purchasing" />
        <Route element={lazyRoute(<PurchaseCreatePage />, "Memuat pembuatan purchase")} path="purchasing/create" />
        <Route element={lazyRoute(<PurchaseReceivePage />, "Memuat penerimaan purchase")} path="purchasing/receive" />
        <Route element={lazyRoute(<PurchaseInvoicePage />, "Memuat invoice purchase")} path="purchasing/invoice" />
        <Route element={lazyRoute(<PurchasePostPage />, "Memuat posting purchase")} path="purchasing/post" />
        <Route element={lazyRoute(<InventoryIndexPage />, "Memuat inventory")} path="inventory" />
        <Route element={lazyRoute(<InventoryAdjustmentPage />, "Memuat adjustment inventory")} path="inventory/adjust" />
        <Route element={lazyRoute(<OpnameCreatePage />, "Memuat pembuatan opname")} path="inventory/opname/create" />
        <Route element={lazyRoute(<OpnameCountPage />, "Memuat hitungan opname")} path="inventory/opname/count" />
        <Route element={lazyRoute(<OpnameRecountPage />, "Memuat hitung ulang opname")} path="inventory/opname/recount" />
        <Route element={lazyRoute(<OpnameReviewPage />, "Memuat review opname")} path="inventory/opname/review" />
        <Route element={lazyRoute(<OpnamePostPage />, "Memuat posting opname")} path="inventory/opname/post" />
        <Route element={lazyRoute(<PricingIndexPage />, "Memuat pricing")} path="pricing" />
        <Route element={lazyRoute(<PriceProposalCreatePage />, "Memuat proposal harga")} path="pricing/proposal/create" />
        <Route element={lazyRoute(<PriceProposalSubmitPage />, "Memuat pengajuan harga")} path="pricing/proposal/submit" />
        <Route element={lazyRoute(<PriceProposalApprovePage />, "Memuat persetujuan harga")} path="pricing/proposal/approve" />
        <Route element={lazyRoute(<PromotionPublishPage />, "Memuat publikasi promosi")} path="pricing/promotion/publish" />
        <Route element={lazyRoute(<ResourcePage page="sales" />, "Memuat sales")} path="sales" />
        <Route element={lazyRoute(<ReturnsIndexPage />, "Memuat retur")} path="returns" />
        <Route element={lazyRoute(<RefundRetryPage />, "Memuat retry refund")} path="returns/refund/retry" />
        <Route element={lazyRoute(<RefundResolvePage />, "Memuat resolusi refund")} path="returns/refund/resolve" />
        <Route element={lazyRoute(<RefundReversePage />, "Memuat reversal refund")} path="returns/refund/reverse" />
        <Route element={lazyRoute(<ResourcePage page="reports" />, "Memuat reports")} path="reports" />
        <Route element={lazyRoute(<SettingsPage />, "Memuat settings")} path="settings" />
        <Route element={lazyRoute(<ResourcePage page="users" />, "Memuat user access")} path="settings/users" />
        <Route element={lazyRoute(<ResourcePage page="terminals" />, "Memuat terminal")} path="settings/terminals" />
        <Route element={lazyRoute(<NotFoundPage />, "Memuat halaman")} path="*" />
      </Route>
    </Routes>
  );
}
