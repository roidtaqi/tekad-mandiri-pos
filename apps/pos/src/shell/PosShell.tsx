import { Outlet } from "react-router-dom";

import { Badge, Button } from "@kastur/ui";

import { usePosRuntime } from "../runtime/PosRuntimeProvider.js";
import { PosNavigation } from "./PosNavigation.js";

export function PosShell() {
  const runtime = usePosRuntime();
  const context = runtime.operational;
  if (context === null) return null;
  const shiftOwned = runtime.activeShift?.cashier_user_id === context.auth.user.id;

  const syncTone = runtime.sync.requiresReviewCount > 0 || runtime.sync.status === "ERROR"
    ? "danger"
    : runtime.sync.status === "OFFLINE"
      ? "warning"
      : runtime.sync.status === "SYNCING"
        ? "info"
        : "success";

  return (
    <div className="pos-app-shell">
      <header className="pos-header">
        <div className="pos-header__identity">
          <strong>{context.business.name}</strong>
          <span>{context.location.name} · {context.terminal.name}</span>
        </div>
        <div className="pos-header__status" aria-label="Status operasional">
          <Badge tone={runtime.online ? "success" : "warning"}>
            {runtime.online ? "Online" : "Offline"}
          </Badge>
          <Badge tone={runtime.activeShift?.status === "OPEN" && shiftOwned ? "success" : "warning"}>
            {runtime.activeShift?.status === "OPEN" && !shiftOwned
              ? "Shift pengguna lain"
              : runtime.activeShift?.status === "OPEN"
              ? `Shift ${runtime.activeShift.shift_number}`
              : runtime.activeShift?.status === "CLOSING"
                ? "Shift ditutup"
                : "Belum ada shift"}
          </Badge>
          <Badge tone={syncTone} title={runtime.sync.message}>
            {runtime.sync.status === "SYNCING"
              ? "Menyinkronkan"
              : runtime.sync.requiresReviewCount > 0
                ? `${runtime.sync.requiresReviewCount} perlu tinjau`
              : `${runtime.sync.pendingCount} antrean`}
          </Badge>
          <span className="pos-header__user">{context.auth.user.display_name}</span>
          <Button
            disabled={runtime.sync.status === "SYNCING" || !runtime.online}
            onClick={() => void runtime.runSync()}
            size="compact"
            variant="secondary"
          >
            Sinkronkan
          </Button>
          <Button onClick={runtime.quickLock} size="compact" variant="ghost">
            Kunci Cepat
          </Button>
        </div>
      </header>
      <PosNavigation />
      <div aria-live="polite" className="pos-sync-message">
        {runtime.sync.message}
      </div>
      <main className="pos-main">
        <Outlet />
      </main>
    </div>
  );
}
