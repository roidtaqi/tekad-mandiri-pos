import type { AuthContextResponse } from "@kastur/contracts";

import type { AuthenticatedRequestContext } from "./auth.js";
import {
  contextForOfflineGrant,
  requireActiveBusinessDevice,
  requirePermission,
} from "./auth.js";
import {
  dispatchCommand,
  readCommandEnvelope,
  type CommandEnvelope,
} from "./commands.js";
import type { ApiEnvironment, RequestDatabase } from "./database.js";
import {
  ApiError,
  normalizeApiError,
  parsePositiveInteger,
  readJsonObject,
} from "./http.js";
import {
  arrayValue,
  integerValue,
  objectValue,
  stringValue,
  uuidValue,
} from "./validation.js";

interface ChangeRow {
  readonly change_type: "DEACTIVATE" | "EVENT" | "INVALIDATE" | "UPSERT";
  readonly entity_id: string;
  readonly entity_type: string;
  readonly entity_version: string | null;
  readonly occurred_at: Date | string;
  readonly payload: unknown;
  readonly sequence: string;
}

interface CursorRow {
  readonly cursor: string;
}

interface BootstrapBusinessRow {
  readonly currency_code: string;
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly timezone: string;
  readonly version: string;
}

interface BootstrapLocationRow {
  readonly code: string;
  readonly id: string;
  readonly is_default: boolean;
  readonly name: string;
  readonly status: string;
  readonly type: string;
  readonly version: string;
}

interface BootstrapTerminalRow {
  readonly code: string;
  readonly id: string;
  readonly location_id: string;
  readonly name: string;
  readonly status: string;
  readonly version: string;
}

interface PushResult {
  readonly command_id: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  readonly result?: unknown;
  readonly warnings?: ReadonlyArray<{
    readonly code: string;
  }>;
  readonly status:
    | "ACCEPTED"
    | "ACCEPTED_WITH_REVIEW"
    | "REJECTED_CONFLICT"
    | "REJECTED_FINAL"
    | "REJECTED_PERMISSION"
    | "REJECTED_RETRYABLE"
    | "REJECTED_VALIDATION";
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function classifyError(error: unknown): PushResult["status"] {
  if (!(error instanceof ApiError)) return "REJECTED_RETRYABLE";
  if (error.status === 401 || error.status === 403) return "REJECTED_PERMISSION";
  if (error.status === 409) return "REJECTED_CONFLICT";
  if (error.status >= 500) return "REJECTED_RETRYABLE";
  if (error.status === 400 || error.status === 404 || error.status === 415) {
    return "REJECTED_VALIDATION";
  }
  return "REJECTED_FINAL";
}

const ONLINE_ONLY_COMMANDS = new Set([
  "purchasing.purchase.post",
  "pricing.proposal.approve",
  "pricing.promotion.publish",
]);

const OFFLINE_SAFE_FACT_COMMANDS = new Set([
  "cash.shift.open",
  "cash.movement.record",
  "cash.shift.close",
  "sales.complete",
]);

interface PushOptions {
  readonly environment?: ApiEnvironment;
  readonly recovery?: boolean;
}

async function commandAuthorizationContext(
  environment: ApiEnvironment,
  current: AuthenticatedRequestContext,
  envelope: CommandEnvelope,
  recovery: boolean,
): Promise<{
  readonly context: AuthenticatedRequestContext;
  readonly staleReview: boolean;
}> {
  const needsHistoricalAuthority =
    recovery ||
    envelope.authorization_version !== current.authorization.authorization_version ||
    envelope.offline_authorization !== undefined;
  if (!needsHistoricalAuthority) return { context: current, staleReview: false };
  if (
    !OFFLINE_SAFE_FACT_COMMANDS.has(envelope.command.command_type) ||
    envelope.offline_authorization === undefined
  ) {
    throw new ApiError(
      403,
      "OFFLINE_RECOVERY_NOT_ALLOWED",
      "Command bukan fakta offline-safe atau tidak memiliki bukti otorisasi.",
    );
  }
  const grant = envelope.offline_authorization;
  const occurredAt = new Date(envelope.command.occurred_at).getTime();
  const issuedAt = new Date(grant.issued_at).getTime();
  const validUntil = new Date(grant.offline_valid_until).getTime();
  if (
    envelope.authorization_version !== grant.authorization.authorization_version ||
    envelope.device_id !== grant.device_id ||
    (envelope.command.location_id !== null &&
      envelope.command.location_id !== grant.authorization.default_location_id) ||
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(validUntil) ||
    occurredAt < issuedAt ||
    occurredAt > validUntil
  ) {
    throw new ApiError(
      403,
      "OFFLINE_AUTHORIZATION_SCOPE_MISMATCH",
      "Command berada di luar scope/waktu bukti otorisasi offline.",
    );
  }
  return {
    context: await contextForOfflineGrant(environment, current, grant),
    staleReview:
      recovery ||
      envelope.authorization_version !== current.authorization.authorization_version,
  };
}

export async function push(
  request: Request,
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  options: PushOptions = {},
): Promise<Readonly<Record<string, unknown>>> {
  requirePermission(context, "workspace.pos.access");
  const body = await readJsonObject(request);
  const batchId = uuidValue(body.batch_id, "batch_id");
  const clientSchemaVersion = integerValue(
    body.client_schema_version,
    "client_schema_version",
    1,
  );
  if (clientSchemaVersion !== 1) {
    throw new ApiError(
      409,
      "CLIENT_SCHEMA_UNSUPPORTED",
      "Versi schema client tidak didukung.",
    );
  }
  const commands = arrayValue(body.commands, "commands").map((command, index) =>
    readCommandEnvelope(command, `commands[${index}]`),
  );
  if (commands.length === 0 || commands.length > 50) {
    throw new ApiError(400, "BATCH_SIZE_INVALID", "Batch harus berisi 1–50 command.");
  }

  const seen = new Set<string>();
  for (const envelope of commands as readonly CommandEnvelope[]) {
    if (seen.has(envelope.command.command_id)) {
      throw new ApiError(400, "DUPLICATE_COMMAND_IN_BATCH", "command_id duplikat dalam batch.");
    }
    seen.add(envelope.command.command_id);
    if (options.recovery !== true) {
      await requireActiveBusinessDevice(database, context, envelope.device_id);
    }
  }

  const results: PushResult[] = [];
  for (const envelope of commands as readonly CommandEnvelope[]) {
    try {
      if (ONLINE_ONLY_COMMANDS.has(envelope.command.command_type)) {
        throw new ApiError(
          409,
          "ONLINE_REQUIRED",
          "Command ini harus dijalankan melalui endpoint online authoritative.",
        );
      }
      const authorization = await commandAuthorizationContext(
        options.environment ?? {},
        context,
        envelope,
        options.recovery === true,
      );
      const outcome = await dispatchCommand(database, authorization.context, envelope);
      const outcomeWarnings =
        typeof outcome.result === "object" && outcome.result !== null
          ? (outcome.result as { readonly warnings?: unknown }).warnings
          : undefined;
      const warnings = new Set<string>(
        Array.isArray(outcomeWarnings)
          ? outcomeWarnings.filter((warning): warning is string => typeof warning === "string")
          : [],
      );
      if (authorization.staleReview) warnings.add("AUTHORIZATION_STALE_EXCEPTION");
      const hasReview = warnings.size > 0;
      results.push({
        command_id: envelope.command.command_id,
        result: {
          ...objectValue(outcome.result, "command result"),
          replayed: outcome.replayed,
          ...(hasReview ? { warnings: [...warnings] } : {}),
        },
        status: hasReview ? "ACCEPTED_WITH_REVIEW" : "ACCEPTED",
        ...(hasReview
          ? {
              warnings: [...warnings].map((code) => ({ code })),
            }
          : {}),
      });
    } catch (error: unknown) {
      const apiError = normalizeApiError(error);
      results.push({
        command_id: envelope.command.command_id,
        error: { code: apiError.code, message: apiError.message },
        status: classifyError(apiError),
      });
    }
  }

  const cursor = await database.query<CursorRow>(
    `SELECT COALESCE(max(sequence), 0)::text AS cursor
     FROM sync.change_feed WHERE business_id = $1`,
    [context.authorization.membership.business_id],
  );
  const latestCursor = cursor.rows[0]?.cursor ?? "0";
  const accepted = results
    .filter((result) => result.status === "ACCEPTED" || result.status === "ACCEPTED_WITH_REVIEW")
    .map((result) => result.command_id);
  const rejected = results
    .filter((result) => !accepted.includes(result.command_id))
    .map((result) => ({
      command_id: result.command_id,
      error_code: result.error?.code ?? "COMMAND_REJECTED",
      message: result.error?.message ?? "Command ditolak.",
    }));

  return {
    accepted_commands: accepted,
    batch_id: batchId,
    latest_cursor: latestCursor,
    rejected_commands: rejected,
    results,
    server_time: new Date().toISOString(),
  };
}

export async function pull(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  url: URL,
): Promise<Readonly<Record<string, unknown>>> {
  requirePermission(context, "workspace.pos.access");
  const cursor = url.searchParams.get("cursor") ?? "0";
  if (!/^[0-9]+$/u.test(cursor)) {
    throw new ApiError(400, "CURSOR_INVALID", "Cursor Sync tidak valid.");
  }
  const limit = parsePositiveInteger(url.searchParams.get("limit"), 500, 1000);
  const rows = await database.query<ChangeRow>(
    `SELECT sequence::text, entity_type, entity_id, change_type,
            entity_version::text, occurred_at, payload
     FROM sync.change_feed
     WHERE business_id = $1
       AND sequence > $2::bigint
       AND (location_id IS NULL OR location_id = $3)
     ORDER BY sequence ASC
     LIMIT $4`,
    [
      context.authorization.membership.business_id,
      cursor,
      context.authorization.default_location_id,
      limit + 1,
    ],
  );
  const hasMore = rows.rows.length > limit;
  const selected = hasMore ? rows.rows.slice(0, limit) : rows.rows;
  const supportedProjectionTypes = new Set([
    "authorization",
    "barcode",
    "payment_method",
    "product",
    "product_unit",
    "promotion",
    "published_retail_price",
    "stock_balance",
  ]);
  const supportedEventTypes = new Set([
    "cash_movement",
    "cash_shift",
    "sales_transaction",
  ]);
  const visible = selected.filter((row) =>
    row.change_type === "EVENT"
      ? supportedEventTypes.has(row.entity_type)
      : supportedProjectionTypes.has(row.entity_type),
  );
  const changes = visible.map((row) => ({
    change_type: row.change_type,
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    entity_version: row.entity_version,
    occurred_at: iso(row.occurred_at),
    payload:
      row.entity_type === "sales_transaction" &&
      typeof row.payload === "object" &&
      row.payload !== null &&
      !Array.isArray(row.payload)
        ? (() => {
            const payload = row.payload as Readonly<Record<string, unknown>>;
            return {
              grand_total: payload.grand_total,
              location_id: payload.location_id,
              occurred_at: payload.occurred_at,
              status: payload.status,
              transaction_id: payload.transaction_id,
              transaction_number: payload.transaction_number,
            };
          })()
        : row.payload,
    sequence: row.sequence,
  }));

  return {
    changes,
    has_more: hasMore,
    next_cursor: selected.at(-1)?.sequence ?? cursor,
    server_time: new Date().toISOString(),
  };
}

export async function acknowledge(
  request: Request,
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
): Promise<Readonly<Record<string, unknown>>> {
  requirePermission(context, "workspace.pos.access");
  const body = await readJsonObject(request);
  const deviceId = uuidValue(body.device_id, "device_id");
  const sequence = stringValue(body.last_applied_sequence, "last_applied_sequence");
  if (!/^[0-9]+$/u.test(sequence)) {
    throw new ApiError(400, "CURSOR_INVALID", "Cursor ACK tidak valid.");
  }
  await requireActiveBusinessDevice(database, context, deviceId);
  const latest = await database.query<CursorRow>(
    `SELECT COALESCE(max(sequence), 0)::text AS cursor
     FROM sync.change_feed WHERE business_id = $1`,
    [context.authorization.membership.business_id],
  );
  const latestCursor = latest.rows[0]?.cursor ?? "0";
  if (BigInt(sequence) > BigInt(latestCursor)) {
    throw new ApiError(409, "CURSOR_AHEAD_OF_SERVER", "Cursor ACK melebihi server.");
  }
  await database.query(
    `INSERT INTO sync.device_sync_states (
       business_id, device_id, last_ack_sequence, last_pull_at,
       last_success_at, updated_at
     ) VALUES ($1, $2, $3::bigint, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (business_id, device_id) DO UPDATE
     SET last_ack_sequence = GREATEST(sync.device_sync_states.last_ack_sequence, EXCLUDED.last_ack_sequence),
         last_pull_at = CURRENT_TIMESTAMP,
         last_success_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
    [context.authorization.membership.business_id, deviceId, sequence],
  );
  return { acknowledged_cursor: sequence, device_id: deviceId };
}

export async function bootstrap(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  url: URL,
  request: Request,
): Promise<Readonly<Record<string, unknown>>> {
  requirePermission(context, "workspace.pos.access");
  const requestedTerminal =
    url.searchParams.get("terminal_id") ?? request.headers.get("x-terminal-id");
  const terminalId = requestedTerminal === null ? null : uuidValue(requestedTerminal, "terminal_id");

  return database.transaction(async (executor) => {
    await executor.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const businessId = context.authorization.membership.business_id;
    const locationId = context.authorization.default_location_id;
    const [business, location, terminals, products, units, barcodes, prices, tiers, promotions, methods, balances, cursor] =
      await Promise.all([
        executor.query<BootstrapBusinessRow>(
          `SELECT id, name, currency_code, timezone, status, version::text
           FROM core.businesses WHERE id = $1 AND status = 'ACTIVE'`,
          [businessId],
        ),
        executor.query<BootstrapLocationRow>(
          `SELECT id, code, name, type, is_default, status, version::text
           FROM core.locations WHERE business_id = $1 AND id = $2 AND status = 'ACTIVE'`,
          [businessId, locationId],
        ),
        executor.query<BootstrapTerminalRow>(
          `SELECT id, location_id, code, name, status, version::text
           FROM core.terminals
           WHERE business_id = $1 AND location_id = $2 AND status = 'ACTIVE'
             AND ($3::uuid IS NULL OR id = $3)
           ORDER BY code ASC LIMIT 1`,
          [businessId, locationId, terminalId],
        ),
        executor.query(
          `SELECT id, sku, name, base_unit_code, track_inventory, status,
                  version::text, updated_at
           FROM catalog.products WHERE business_id = $1 ORDER BY id`,
          [businessId],
        ),
        executor.query(
          `SELECT id, product_id, unit_code, display_name, conversion_factor::text,
                  can_sell, can_purchase, allow_decimal_qty, status,
                  version::text, updated_at
           FROM catalog.product_units WHERE business_id = $1 ORDER BY id`,
          [businessId],
        ),
        executor.query(
          `SELECT id, product_unit_id, barcode, is_internal, status, deactivated_at
           FROM catalog.barcodes WHERE business_id = $1 ORDER BY id`,
          [businessId],
        ),
        executor.query(
          `SELECT pv.id AS price_version_id, pv.product_unit_id,
                  pt.unit_price::text, pv.effective_from, pv.effective_to,
                  pv.status, pv.created_at
           FROM pricing.price_versions pv
           JOIN pricing.price_tier_versions pt ON pt.price_version_id = pv.id
           WHERE pv.business_id = $1 AND pv.status IN ('ACTIVE', 'SCHEDULED')
             AND (pv.effective_to IS NULL OR CURRENT_TIMESTAMP < pv.effective_to)
             AND pt.tier_code = 'RETAIL' AND pt.min_qty = 1
           ORDER BY pv.product_unit_id, pv.effective_from`,
          [businessId],
        ),
        executor.query(
          `SELECT pt.id, pt.price_version_id, pt.tier_code,
                  pt.min_qty::text, pt.unit_price::text, pt.sort_order
           FROM pricing.price_tier_versions pt
           JOIN pricing.price_versions pv ON pv.id = pt.price_version_id
           WHERE pv.business_id = $1 AND pv.status IN ('ACTIVE', 'SCHEDULED')
             AND (pv.effective_to IS NULL OR CURRENT_TIMESTAMP < pv.effective_to)
           ORDER BY pt.price_version_id, pt.sort_order`,
          [businessId],
        ),
        executor.query(
          `SELECT id, id AS promotion_id, name, product_unit_id, promotion_type, value::text,
                  min_qty::text, priority, effective_from, effective_to, status,
                  created_at, updated_at, version::text
           FROM pricing.promotions
           WHERE business_id = $1 AND status IN ('ACTIVE', 'SCHEDULED')
             AND CURRENT_TIMESTAMP < effective_to
           ORDER BY product_unit_id, effective_from, priority DESC, created_at, id`,
          [businessId],
        ),
        executor.query(
          `SELECT id, code, name, is_cash, offline_allowed, requires_reference,
                  status, version::text
           FROM sales.payment_methods
           WHERE business_id = $1 AND status = 'ACTIVE'
           ORDER BY code`,
          [businessId],
        ),
        executor.query(
          `SELECT business_id, location_id, product_id, base_quantity::text,
                  last_movement_id, updated_at
           FROM inventory.stock_balances
           WHERE business_id = $1 AND location_id = $2
           ORDER BY product_id`,
          [businessId, locationId],
        ),
        executor.query<CursorRow>(
          `SELECT COALESCE(max(sequence), 0)::text AS cursor
           FROM sync.change_feed WHERE business_id = $1`,
          [businessId],
        ),
      ]);

    const selectedBusiness = business.rows[0];
    const selectedLocation = location.rows[0];
    const selectedTerminal = terminals.rows[0];
    if (selectedBusiness === undefined || selectedLocation === undefined) {
      throw new ApiError(403, "OPERATIONAL_CONTEXT_INCOMPLETE", "Business/Location tidak aktif.");
    }
    if (selectedTerminal === undefined) {
      throw new ApiError(409, "TERMINAL_NOT_CONFIGURED", "Terminal aktif belum dikonfigurasi.");
    }

    const authorization: AuthContextResponse = {
      ...context.authorization,
      server_time: new Date().toISOString(),
    };
    return {
      authorization,
      barcodes: barcodes.rows,
      bootstrap_version: 1,
      business: selectedBusiness,
      location: selectedLocation,
      payment_methods: methods.rows,
      product_units: units.rows,
      products: products.rows,
      promotions: promotions.rows,
      published_price_tiers: tiers.rows,
      published_price_versions: prices.rows,
      server_time: authorization.server_time,
      settings: {
        language: "id-ID",
        receipt_width: "80mm",
      },
      stock_balances: balances.rows,
      sync_cursor: cursor.rows[0]?.cursor ?? "0",
      terminal: selectedTerminal,
    };
  });
}
