import type { ReactNode } from "react";
import { hasCachedPermission } from "@kastur/auth-client";
import {
  Badge,
  EmptyState,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
  Text,
} from "@kastur/ui";

import { useAuthContext } from "../auth/AuthContext";
import {
  resourcePageConfigs,
  type CellKind,
  type ResourcePageKey,
} from "./resource-config";
import {
  InvalidResourceResponse,
  PermissionDenied,
  ResourceFailure,
  ResourceLoading,
} from "./ResourceStates";
import { useBackofficeResource } from "./useBackofficeResource";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemRows(value: unknown): readonly Record<string, unknown>[] | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(isRecord)) {
    return null;
  }
  return value.items;
}

function groupedDecimal(value: unknown, prefix = ""): string {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const raw = String(value);
  const match = raw.match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/u);
  if (match === null) return raw;
  const sign = match[1] ?? "";
  const integer = (match[2] ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  const fraction = (match[3] ?? "").replace(/0+$/u, "");
  return `${prefix}${sign}${integer}${fraction.length === 0 ? "" : `,${fraction}`}`;
}

function dateLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const hasTime = value.includes("T");
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    ...(hasTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function statusTone(value: string): "danger" | "neutral" | "success" | "warning" {
  if (["ACTIVE", "COMPLETED", "POSTED", "RESOLVED"].includes(value)) return "success";
  if (["CRITICAL", "FAILED", "REVOKED", "CANCELLED"].includes(value)) return "danger";
  if (["OPEN", "PENDING", "REQUIRES_ACTION", "WARNING", "REVIEW_REQUIRED"].includes(value)) {
    return "warning";
  }
  return "neutral";
}

function cellValue(value: unknown, kind: CellKind = "text"): ReactNode {
  if (kind === "status") {
    const label = typeof value === "string" && value.length > 0 ? value : "—";
    return <Badge tone={statusTone(label)}>{label.replaceAll("_", " ")}</Badge>;
  }
  if (kind === "date") return dateLabel(value);
  if (kind === "id") {
    return typeof value === "string" && value.length > 0
      ? <code className="resource-technical-id">{value}</code>
      : "—";
  }
  if (kind === "money") return groupedDecimal(value, "Rp ");
  if (kind === "quantity" || kind === "count") return groupedDecimal(value);
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return "—";
}

export function ResourcePage({ page }: { readonly page: ResourcePageKey }) {
  const authContext = useAuthContext();
  const config = resourcePageConfigs[page];
  const allowed = hasCachedPermission(authContext, config.permission);
  const state = useBackofficeResource<unknown>(config.resource, allowed);

  if (!allowed) return <PermissionDenied permission={config.permission} />;

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading level={1} size="h1">
          {config.title}
        </Heading>
        <Text tone="secondary">{config.description}</Text>
      </Stack>

      {state.status === "loading" || state.status === "idle" ? (
        <ResourceLoading label={`Memuat ${config.title}`} />
      ) : state.status === "error" ? (
        <ResourceFailure error={state.error} onRetry={state.retry} />
      ) : (
        <ResourceRows configKey={page} data={state.data} />
      )}
    </Stack>
  );
}

function ResourceRows({
  configKey,
  data,
}: {
  readonly configKey: ResourcePageKey;
  readonly data: unknown;
}) {
  const config = resourcePageConfigs[configKey];
  const rows = itemRows(data);
  if (rows === null) return <InvalidResourceResponse />;
  if (rows.length === 0) {
    return <EmptyState description={config.emptyDescription} title={config.emptyTitle} />;
  }

  return (
    <div className="resource-table">
      <TableWrapper label={`Daftar ${config.title}`}>
        <Table>
          <TableHeader>
            <TableRow>
              {config.columns.map((column) => (
                <TableHead key={column.key}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={typeof row.id === "string" ? row.id : index}>
                {config.columns.map((column) => (
                  <TableCell key={column.key}>
                    {cellValue(
                      row[column.key],
                      "kind" in column ? column.kind : undefined,
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
    </div>
  );
}
