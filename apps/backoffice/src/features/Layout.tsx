import { hasCachedPermission } from "@kastur/auth-client";
import { Button, Sidebar, Text } from "@kastur/ui";
import { Link, Outlet } from "react-router-dom";

import { useBackofficeRuntime } from "../runtime/RuntimeContext";

interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly permissions: readonly string[];
  readonly permissionMode?: "all" | "any";
}

const menuItems: readonly MenuItem[] = [
  {
    id: "dashboard",
    label: "Ringkasan",
    path: "/dashboard",
    permissions: ["workspace.backoffice.access"],
  },
  {
    id: "review",
    label: "Perlu Ditinjau",
    path: "/review",
    permissions: ["workspace.backoffice.access"],
  },
  { id: "products", label: "Products", path: "/products", permissions: ["product.read"] },
  {
    id: "purchasing",
    label: "Purchasing",
    path: "/purchasing",
    permissions: ["purchase.read"],
  },
  {
    id: "inventory",
    label: "Inventory",
    path: "/inventory",
    permissions: ["inventory.read"],
  },
  { id: "pricing", label: "Pricing", path: "/pricing", permissions: ["pricing.read"] },
  {
    id: "sales",
    label: "Sales",
    path: "/sales",
    permissions: ["transaction.history.read"],
  },
  { id: "returns", label: "Retur", path: "/returns", permissions: ["return.read"] },
  {
    id: "reports",
    label: "Reports",
    path: "/reports",
    permissions: ["workspace.backoffice.access"],
  },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    permissionMode: "any",
    permissions: ["settings.read", "user.read"],
  },
];

function canSeeMenuItem(
  authContext: ReturnType<typeof useBackofficeRuntime>["authContext"],
  item: MenuItem,
): boolean {
  const decisions = item.permissions.map((permission) =>
    hasCachedPermission(authContext, permission),
  );
  return item.permissionMode === "any" ? decisions.some(Boolean) : decisions.every(Boolean);
}

export function Layout() {
  const { authContext, logout } = useBackofficeRuntime();
  const visibleItems = menuItems.filter((item) => canSeeMenuItem(authContext, item));

  return (
    <div className="ks-root backoffice-layout">
      <aside className="backoffice-sidebar">
        <Link className="backoffice-brand" to="/dashboard">
          Kastur
          <Text as="span" size="caption" tone="muted">
            Back Office
          </Text>
        </Link>

        <div className="backoffice-navigation">
          <Sidebar items={visibleItems} />
        </div>

        <div className="operator-summary">
          <Text weight="medium">{authContext.user.display_name}</Text>
          <Text size="caption" tone="muted">
            {authContext.primary_role}
          </Text>
          <Button fullWidth onClick={logout} size="compact" variant="secondary">
            Keluar
          </Button>
        </div>
      </aside>

      <main className="backoffice-main">
        <Outlet />
      </main>
    </div>
  );
}
