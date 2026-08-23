import { hasCachedPermission } from "@kastur/auth-client";
import { Heading, Stack, Surface, Text } from "@kastur/ui";

import { useAuthContext } from "../auth/AuthContext";
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

function summaryValue(summary: Record<string, unknown>, key: string): string {
  const value = summary[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}

function moneyValue(value: string): string {
  const match = value.match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/u);
  if (match === null) return value;
  const integer = (match[2] ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  const fraction = (match[3] ?? "").replace(/0+$/u, "");
  return `Rp ${match[1] ?? ""}${integer}${fraction.length === 0 ? "" : `,${fraction}`}`;
}

export function OverviewPage() {
  const authContext = useAuthContext();
  const allowed = hasCachedPermission(authContext, "workspace.backoffice.access");
  const state = useBackofficeResource<unknown>("overview", allowed);

  if (!allowed) return <PermissionDenied permission="workspace.backoffice.access" />;

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading level={1} size="h1">
          Ringkasan
        </Heading>
        <Text tone="secondary">Kondisi operasional bisnis dari platform bersama.</Text>
      </Stack>

      {state.status === "loading" || state.status === "idle" ? (
        <ResourceLoading label="Memuat ringkasan" />
      ) : state.status === "error" ? (
        <ResourceFailure error={state.error} onRetry={state.retry} />
      ) : (
        <OverviewContent data={state.data} />
      )}
    </Stack>
  );
}

function OverviewContent({ data }: { readonly data: unknown }) {
  if (!isRecord(data) || !isRecord(data.summary) || !Array.isArray(data.attention)) {
    return <InvalidResourceResponse />;
  }

  const summary = data.summary;
  const cards = [
    ["Penjualan hari ini", moneyValue(summaryValue(summary, "today_sales"))],
    ["Transaksi hari ini", summaryValue(summary, "today_transactions")],
    ["Produk aktif", summaryValue(summary, "active_products")],
    ["Stok negatif", summaryValue(summary, "negative_stock_products")],
    ["Purchase terbuka", summaryValue(summary, "open_purchases")],
    ["Shift terbuka", summaryValue(summary, "open_shift_count")],
    ["Perlu ditinjau", summaryValue(summary, "open_attention")],
  ] as const;

  return (
    <Stack gap={4}>
      <div className="summary-grid">
        {cards.map(([label, value]) => (
          <Surface elevation={1} key={label} padding="default">
            <Stack gap={1}>
              <Text size="caption" tone="muted" weight="bold">
                {label}
              </Text>
              <Text className="summary-value" weight="bold">
                {value}
              </Text>
            </Stack>
          </Surface>
        ))}
      </div>

      <Surface elevation={1} padding="spacious">
        <Stack gap={2}>
          <Heading level={2} size="h2">
            Perhatian terbaru
          </Heading>
          {data.attention.length === 0 ? (
            <Text tone="secondary">Tidak ada pengecualian operasional terbuka.</Text>
          ) : (
            <ul className="attention-list">
              {data.attention.filter(isRecord).map((item, index) => (
                <li key={typeof item.id === "string" ? item.id : index}>
                  <Text weight="medium">
                    {typeof item.summary === "string" ? item.summary : "Pengecualian operasional"}
                  </Text>
                  <Text size="caption" tone="muted">
                    {[item.domain, item.severity]
                      .filter((value): value is string => typeof value === "string")
                      .join(" · ")}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </Surface>
    </Stack>
  );
}
