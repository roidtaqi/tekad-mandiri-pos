import React from "react";
import { Outlet, Link } from "react-router-dom";
import { Sidebar } from "@kastur/ui";

const MENU_ITEMS = [
  { id: "dashboard", label: "Ringkasan", path: "/dashboard" },
  { id: "review", label: "Perlu Ditinjau", path: "/review" },
  { id: "products", label: "Products", path: "/products" },
  { id: "purchasing", label: "Purchasing", path: "/purchasing" },
  { id: "inventory", label: "Inventory", path: "/inventory" },
  { id: "pricing", label: "Pricing", path: "/pricing" },
  { id: "sales", label: "Sales", path: "/sales" },
  { id: "reports", label: "Reports", path: "/reports" },
  { id: "settings", label: "Settings", path: "/settings" },
];

export function Layout() {
  return (
    <div className="ks-root ks-backoffice-layout" style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="ks-backoffice-sidebar" style={{ width: "240px", borderRight: "1px solid var(--ks-color-border)", padding: "var(--ks-space-4)" }}>
        <div style={{ marginBottom: "var(--ks-space-6)" }}>
          <Link to="/" style={{ textDecoration: "none", color: "var(--ks-color-text-primary)", fontWeight: "bold", fontSize: "1.25rem" }}>
            Kastur
          </Link>
        </div>
        <Sidebar items={MENU_ITEMS} />
      </aside>
      <main className="ks-backoffice-main" style={{ flex: 1, padding: "var(--ks-space-6)", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
