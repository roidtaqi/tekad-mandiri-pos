import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Text } from "./typography.js";

export interface SidebarItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly icon?: React.ReactNode;
}

export interface SidebarProps {
  readonly items: ReadonlyArray<SidebarItem>;
}

export function Sidebar({ items }: SidebarProps) {
  const location = useLocation();

  return (
    <nav className="ks-sidebar">
      <ul className="ks-sidebar-list">
        {items.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <li key={item.id} className="ks-sidebar-item">
              <Link
                to={item.path}
                className="ks-sidebar-link"
                data-active={isActive ? "true" : "false"}
              >
                {item.icon && <span className="ks-sidebar-icon">{item.icon}</span>}
                <Text>{item.label}</Text>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface BreadcrumbItem {
  readonly label: string;
  readonly path?: string;
}

export interface BreadcrumbProps {
  readonly items: ReadonlyArray<BreadcrumbItem>;
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="ks-breadcrumb">
      <ol className="ks-breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="ks-breadcrumb-item">
              {item.path && !isLast ? (
                <Link to={item.path} className="ks-breadcrumb-link">
                  {item.label}
                </Link>
              ) : (
                <span className="ks-breadcrumb-current" aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className="ks-breadcrumb-separator" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
