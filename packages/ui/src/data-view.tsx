import React from "react";
import { Heading, Text } from "./typography.js";

export interface RecordHeaderProps {
  readonly title: React.ReactNode;
  readonly subtitle?: React.ReactNode;
  readonly status?: React.ReactNode;
  readonly actions?: React.ReactNode;
}

export function RecordHeader({ title, subtitle, status, actions }: RecordHeaderProps) {
  return (
    <header className="ks-record-header">
      <div className="ks-record-header-main">
        <div className="ks-record-header-title">
          {typeof title === "string" ? <Heading level={1} size="h1">{title}</Heading> : title}
          {status && <div className="ks-record-header-status">{status}</div>}
        </div>
        {subtitle && (
          <div className="ks-record-header-subtitle">
            {typeof subtitle === "string" ? <Text tone="secondary">{subtitle}</Text> : subtitle}
          </div>
        )}
      </div>
      {actions && <div className="ks-record-header-actions">{actions}</div>}
    </header>
  );
}

export interface FilterBarProps {
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
}

export function FilterBar({ children, actions }: FilterBarProps) {
  return (
    <div className="ks-filter-bar">
      <div className="ks-filter-bar-inputs">{children}</div>
      {actions && <div className="ks-filter-bar-actions">{actions}</div>}
    </div>
  );
}
