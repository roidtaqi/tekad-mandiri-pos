import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@kastur/ui";

import { PosShell } from "../shell/PosShell.js";
import { SellSessionProvider } from "../sell/SellSession.js";

const SellScreen = lazy(async () => ({
  default: (await import("../sell/SellScreen.js")).SellScreen,
}));
const ShiftScreen = lazy(async () => ({
  default: (await import("../shift/ShiftScreen.js")).ShiftScreen,
}));
const TransactionsScreen = lazy(async () => ({
  default: (await import("../transactions/TransactionsScreen.js")).TransactionsScreen,
}));
const ReturnScreen = lazy(async () => ({
  default: (await import("../returns/ReturnScreen.js")).ReturnScreen,
}));
const HeldUnavailableScreen = lazy(async () => ({
  default: (await import("./UnavailableScreen.js")).HeldUnavailableScreen,
}));

function routeElement(element: ReactNode, label: string) {
  return (
    <Suspense
      fallback={(
        <div className="pos-route-loading">
          <Spinner label={label} />
        </div>
      )}
    >
      {element}
    </Suspense>
  );
}

export function PosRoutes() {
  return (
    <SellSessionProvider>
      <Routes>
        <Route element={<PosShell />}>
          <Route index element={<Navigate replace to="/kasir" />} />
          <Route path="kasir" element={routeElement(<SellScreen />, "Memuat Kasir")} />
          <Route path="tertahan" element={routeElement(<HeldUnavailableScreen />, "Memuat Tertahan")} />
          <Route path="transaksi" element={routeElement(<TransactionsScreen />, "Memuat Transaksi")} />
          <Route path="transaksi/:transactionId" element={routeElement(<TransactionsScreen />, "Memuat Transaksi")} />
          <Route path="retur" element={routeElement(<ReturnScreen />, "Memuat Retur")} />
          <Route path="shift" element={routeElement(<ShiftScreen />, "Memuat Shift")} />
          <Route path="*" element={<Navigate replace to="/kasir" />} />
        </Route>
      </Routes>
    </SellSessionProvider>
  );
}
