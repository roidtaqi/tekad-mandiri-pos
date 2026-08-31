import {
  SYSTEM_HEALTH_PATH,
  type SystemHealthResponse,
} from "@kastur/contracts";

import {
  authenticateRecoveryRequest,
  authenticateRequest,
  enrollDevice,
  revokeCurrentSession,
  sha256Hex,
  verifySetupToken,
} from "./auth.js";
import { queryBackofficeResource } from "./backoffice.js";
import {
  createProduct,
  getProduct,
  listCatalogOptions,
  listProducts,
} from "./catalog.js";
import {
  DatabaseConfigurationError,
  PgRequestDatabase,
  type ApiEnvironment,
  type RequestDatabase,
} from "./database.js";
import { executeOnlineCommand } from "./commands.js";
import {
  ApiError,
  errorResponse,
  json,
  jsonHeaders,
  readJsonObject,
  resolveCorsOrigin,
} from "./http.js";
import { getReturnableSale, listReturnableSales } from "./returns.js";
import { acknowledge, bootstrap, pull, push } from "./sync.js";
import {
  arrayValue,
  objectValue,
  stringValue,
  uuidValue,
} from "./validation.js";

export interface ApiDependencies {
  readonly database?: RequestDatabase;
}

function isDatabaseRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/v1/auth/") ||
    pathname.startsWith("/api/v1/backoffice/") ||
    pathname.startsWith("/api/v1/catalog/") ||
    pathname.startsWith("/api/v1/returns/") ||
    pathname === "/api/v1/commands" ||
    pathname.startsWith("/api/v1/sync/") ||
    pathname.startsWith("/api/v1/system/setup")
  );
}

async function routeAuthenticatedRequest(
  request: Request,
  database: RequestDatabase,
  url: URL,
  environment: ApiEnvironment,
): Promise<Response> {
  const { pathname } = url;

  if (request.method === "POST" && pathname === "/api/v1/auth/enroll-device") {
    return await enrollDevice(request, database, environment);
  }

  const context = await authenticateRequest(request, database, environment);

  if (request.method === "GET" && pathname === "/api/v1/auth/context") {
    return json({ data: context.authorization, meta: { server_time: new Date().toISOString() } }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "POST" && pathname === "/api/v1/auth/logout") {
    await revokeCurrentSession(database, context);
    const corsOrigin = resolveCorsOrigin(request, environment.ALLOWED_ORIGINS);
    const headers = new Headers(jsonHeaders);
    if (corsOrigin !== null) {
      headers.set("access-control-allow-origin", corsOrigin);
      headers.set("vary", "Origin");
    } else {
      headers.delete("access-control-allow-origin");
    }
    return new Response(null, { headers, status: 204 });
  }
  if (request.method === "GET" && pathname === "/api/v1/auth/terminals") {
    const terminals = await database.query(
      `SELECT t.id, t.name, t.code, t.status, t.location_id, l.name AS location_name
       FROM core.terminals t
       JOIN core.locations l ON l.id = t.location_id
       WHERE t.business_id = $1 AND t.status = 'ACTIVE'
       ORDER BY t.created_at ASC`,
      [context.authorization.membership.business_id],
    );
    return json({
      data: terminals.rows,
      meta: { server_time: new Date().toISOString() },
    }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  const backofficeMatch = pathname.match(/^\/api\/v1\/backoffice\/([^/]+)$/u);
  if (request.method === "GET" && backofficeMatch?.[1] !== undefined) {
    return json({
      data: await queryBackofficeResource(
        database,
        context,
        backofficeMatch[1],
        url,
      ),
      meta: { server_time: new Date().toISOString() },
    }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && pathname === "/api/v1/catalog/products") {
    return json({ data: await listProducts(database, context, url) }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  const productMatch = pathname.match(/^\/api\/v1\/catalog\/products\/([^/]+)$/u);
  if (request.method === "GET" && productMatch?.[1] !== undefined) {
    return json({ data: await getProduct(database, context, productMatch[1]) }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "POST" && pathname === "/api/v1/catalog/products") {
    return json({ data: await createProduct(request, database, context) }, { status: 201 }, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "POST" && pathname === "/api/v1/commands") {
    return json(await executeOnlineCommand(request, database, context), {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && pathname === "/api/v1/returns/sales") {
    return json({
      data: await listReturnableSales(database, context, url),
      meta: { server_time: new Date().toISOString() },
    }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  const returnableSaleMatch = pathname.match(/^\/api\/v1\/returns\/sales\/([^/]+)$/u);
  if (request.method === "GET" && returnableSaleMatch?.[1] !== undefined) {
    return json({
      data: await getReturnableSale(database, context, returnableSaleMatch[1]),
      meta: { server_time: new Date().toISOString() },
    }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && pathname === "/api/v1/catalog/categories") {
    return json({ data: await listCatalogOptions(database, context, "categories") }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && pathname === "/api/v1/catalog/brands") {
    return json({ data: await listCatalogOptions(database, context, "brands") }, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && pathname === "/api/v1/sync/bootstrap") {
    return json(await bootstrap(database, context, url, request), {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "POST" && pathname === "/api/v1/sync/push") {
    return json(await push(request, database, context, { environment }), {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && pathname === "/api/v1/sync/pull") {
    return json(await pull(database, context, url), {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "POST" && pathname === "/api/v1/sync/ack") {
    return json(await acknowledge(request, database, context), {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }

  throw new ApiError(404, "NOT_FOUND", "Endpoint tidak ditemukan.");
}

async function routeRecoveryPush(
  request: Request,
  database: RequestDatabase,
  environment: ApiEnvironment,
): Promise<Response> {
  const body = await readJsonObject(request.clone());
  const commands = arrayValue(body.commands, "commands");
  const firstCommand = commands[0];
  if (firstCommand === undefined) {
    throw new ApiError(400, "BATCH_SIZE_INVALID", "Batch recovery tidak boleh kosong.");
  }
  const batchId = uuidValue(body.batch_id, "batch_id");
  const recoveryReason = stringValue(body.recovery_reason, "recovery_reason").trim();
  if (recoveryReason.length < 10 || recoveryReason.length > 500) {
    throw new ApiError(
      400,
      "RECOVERY_REASON_INVALID",
      "Alasan recovery wajib berisi 10–500 karakter.",
    );
  }
  const command = objectValue(firstCommand, "commands[0]");
  const approver = await authenticateRequest(request, database, environment);
  const context = await authenticateRecoveryRequest(
    database,
    environment,
    approver,
    command.offline_authorization,
  );
  await database.query(
    `INSERT INTO audit.audit_events (
       id, business_id, location_id, actor_type, actor_user_id,
       actor_role_snapshot, action, entity_type, entity_id, occurred_at,
       recorded_at, device_id, session_id, reason, after_data,
       correlation_id, authorization_version
     ) VALUES (
       $1, $2, $3, 'USER', $4, $5, 'OFFLINE_FACT_RECOVERY_APPROVED',
       'sync_recovery_batch', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
       $7, $8, $9, $10::jsonb, $6, $11
     )`,
    [
      crypto.randomUUID(),
      approver.authorization.membership.business_id,
      context.authorization.default_location_id,
      approver.authorization.user.id,
      approver.authorization.primary_role,
      batchId,
      context.device_id,
      approver.session_id,
      recoveryReason,
      JSON.stringify({
        command_count: commands.length,
        historical_session_id: context.session_id,
        terminal_id: context.selected_terminal_id,
      }),
      approver.authorization.authorization_version,
    ],
  );
  const result = await push(request, database, context, {
    environment,
    recovery: true,
  });
  return json(result, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
}

const OWNER_ROLE_ID = "11111111-1111-4111-8111-111111111111";

async function routeSystemSetup(
  request: Request,
  database: RequestDatabase,
  url: URL,
  environment: ApiEnvironment,
): Promise<Response> {
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/v1/system/setup/status") {
    const existing = await database.query(
      `SELECT count(*)::int AS count FROM core.businesses WHERE status = 'ACTIVE'`,
    );
    const count = typeof existing.rows[0]?.count === "number" ? existing.rows[0].count : 0;
    const requiresSetupToken =
      typeof environment.KASTUR_SETUP_TOKEN === "string" &&
      environment.KASTUR_SETUP_TOKEN.trim() !== "";
    return json(
      {
        initialized: count > 0,
        requires_setup_token: requiresSetupToken,
        status: count > 0 ? "INITIALIZED" : "NOT_INITIALIZED",
      },
      {},
      { allowedOrigins: environment.ALLOWED_ORIGINS, request },
    );
  }

  if (request.method === "POST" && pathname === "/api/v1/system/setup") {
    const body = await readJsonObject(request);

    // Validate one-time setup token authorization
    const tokenHeader = request.headers.get("x-kastur-setup-token");
    const tokenBody = typeof body.setup_token === "string" ? body.setup_token : null;
    const providedToken = tokenHeader || tokenBody;

    if (!verifySetupToken(providedToken, environment.KASTUR_SETUP_TOKEN)) {
      throw new ApiError(
        401,
        "SETUP_UNAUTHORIZED",
        "Kunci inisialisasi (Setup Token) tidak valid atau belum diisi.",
      );
    }

    return await database.transaction(async (tx) => {
      const existing = await tx.query(
        `SELECT count(*)::int AS count FROM core.businesses WHERE status = 'ACTIVE'`,
      );
      const count = typeof existing.rows[0]?.count === "number" ? existing.rows[0].count : 0;
      if (count > 0) {
        throw new ApiError(
          409,
          "ALREADY_INITIALIZED",
          "Bisnis sudah diinisialisasi pada sistem ini.",
        );
      }

      const businessName =
        typeof body.business_name === "string" && body.business_name.trim() !== ""
          ? body.business_name.trim()
          : "Kastur Retail";
      const ownerName =
        typeof body.owner_name === "string" && body.owner_name.trim() !== ""
          ? body.owner_name.trim()
          : "Owner";
      const ownerEmail =
        typeof body.owner_email === "string" && body.owner_email.trim() !== ""
          ? body.owner_email.trim()
          : "owner@kastur.local";
      const locationName =
        typeof body.location_name === "string" && body.location_name.trim() !== ""
          ? body.location_name.trim()
          : "Toko Utama";
      const terminalName =
        typeof body.terminal_name === "string" && body.terminal_name.trim() !== ""
          ? body.terminal_name.trim()
          : "Kasir 1";
      const timezone =
        typeof body.timezone === "string" && body.timezone.trim() !== ""
          ? body.timezone.trim()
          : "Asia/Makassar";

      const businessId = crypto.randomUUID();
      const locationId = crypto.randomUUID();
      const ownerUserId = crypto.randomUUID();
      const membershipId = crypto.randomUUID();
      const deviceId = crypto.randomUUID();
      const terminalId = crypto.randomUUID();
      const paymentMethodId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      const correlationId = crypto.randomUUID();

      const sessionSecretBytes = new Uint8Array(32);
      crypto.getRandomValues(sessionSecretBytes);
      const sessionSecret = btoa(String.fromCharCode(...sessionSecretBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const sessionHash = await sha256Hex(sessionSecret);

      await tx.query(
        `INSERT INTO core.businesses (id, name, currency_code, timezone, status)
         VALUES ($1, $2, 'IDR', $3, 'ACTIVE')`,
        [businessId, businessName, timezone],
      );

      await tx.query(
        `INSERT INTO core.locations (id, business_id, code, name, type, is_default, status)
         VALUES ($1, $2, 'MAIN', $3, 'STORE', TRUE, 'ACTIVE')`,
        [locationId, businessId, locationName],
      );

      await tx.query(
        `INSERT INTO identity.users (id, display_name, email, status)
         VALUES ($1, $2, $3, 'ACTIVE')`,
        [ownerUserId, ownerName, ownerEmail],
      );

      await tx.query(
        `INSERT INTO identity.business_memberships (id, business_id, user_id, status)
         VALUES ($1, $2, $3, 'ACTIVE')`,
        [membershipId, businessId, ownerUserId],
      );

      await tx.query(
        `INSERT INTO identity.membership_roles (membership_id, role_id, is_primary, assigned_by)
         VALUES ($1, $2, TRUE, $3)`,
        [membershipId, OWNER_ROLE_ID, ownerUserId],
      );

      await tx.query(
        `INSERT INTO identity.authorization_versions (membership_id, version)
         VALUES ($1, 1)`,
        [membershipId],
      );

      await tx.query(
        `INSERT INTO identity.devices (id, business_id, code, display_name, device_type, status)
         VALUES ($1, $2, $3, $4, 'PWA', 'ACTIVE')`,
        [deviceId, businessId, `DEV-${deviceId.slice(0, 8)}`, terminalName],
      );

      await tx.query(
        `INSERT INTO core.terminals (id, business_id, location_id, code, name, status)
         VALUES ($1, $2, $3, 'POS-1', $4, 'ACTIVE')`,
        [terminalId, businessId, locationId, terminalName],
      );

      await tx.query(
        `INSERT INTO sales.payment_methods (id, business_id, code, name, is_cash, offline_allowed, requires_reference, status)
         VALUES ($1, $2, 'CASH', 'Tunai', TRUE, TRUE, FALSE, 'ACTIVE')`,
        [paymentMethodId, businessId],
      );

      await tx.query(
        `INSERT INTO catalog.categories (id, business_id, code, name, status)
         VALUES ($1, $2, 'GENERAL', 'Umum', 'ACTIVE')`,
        [categoryId, businessId],
      );

      await tx.query(
        `INSERT INTO identity.sessions (id, user_id, business_id, device_id, session_secret_hash, issued_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
        [sessionId, ownerUserId, businessId, deviceId, sessionHash],
      );

      await tx.query(
        `INSERT INTO audit.audit_events (
           id, business_id, location_id, actor_type, actor_user_id,
           actor_role_snapshot, action, entity_type, entity_id, occurred_at,
           device_id, session_id, reason, after_data, correlation_id,
           authorization_version
         ) VALUES (
           $1, $2, $3, 'USER', $4, 'OWNER', 'BUSINESS_BOOTSTRAPPED',
           'business', $2, CURRENT_TIMESTAMP, $5, $6,
           'Initial system setup via API', $7::jsonb, $8, 1
         )`,
        [
          auditId,
          businessId,
          locationId,
          ownerUserId,
          deviceId,
          sessionId,
          JSON.stringify({
            business_name: businessName,
            location_id: locationId,
            terminal_id: terminalId,
          }),
          correlationId,
        ],
      );

      return json(
        {
          business_id: businessId,
          business_name: businessName,
          device_id: deviceId,
          location_id: locationId,
          location_name: locationName,
          message: "Bisnis awal berhasil diinisialisasi.",
          owner_email: ownerEmail,
          owner_name: ownerName,
          owner_user_id: ownerUserId,
          session_secret: sessionSecret,
          terminal_id: terminalId,
          terminal_name: terminalName,
        },
        { status: 201 },
        { allowedOrigins: environment.ALLOWED_ORIGINS, request },
      );
    });
  }

  throw new ApiError(404, "NOT_FOUND", "Endpoint tidak ditemukan.");
}

export async function handleRequest(
  request: Request,
  environment: ApiEnvironment = {},
  dependencies: ApiDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    const corsOrigin = resolveCorsOrigin(request, environment.ALLOWED_ORIGINS);
    const headers = new Headers(jsonHeaders);
    headers.set("access-control-max-age", "86400");
    if (corsOrigin !== null) {
      headers.set("access-control-allow-origin", corsOrigin);
      headers.set("vary", "Origin");
    } else {
      headers.delete("access-control-allow-origin");
    }
    return new Response(null, {
      headers,
      status: 204,
    });
  }
  if (
    request.method === "GET" &&
    (url.pathname === SYSTEM_HEALTH_PATH ||
      url.pathname === "/health" ||
      url.pathname === "/api/health")
  ) {
    const body = { status: "ok" } satisfies SystemHealthResponse;
    return json(body, {}, { allowedOrigins: environment.ALLOWED_ORIGINS, request });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/system/health") {
    const hasDatabase =
      Boolean(environment.HYPERDRIVE?.connectionString) ||
      Boolean(environment.DATABASE_URL?.trim());
    if (!hasDatabase && dependencies.database === undefined) {
      return json(
        { reason: "DATABASE_NOT_CONFIGURED", status: "unhealthy" },
        { status: 503 },
        { allowedOrigins: environment.ALLOWED_ORIGINS, request },
      );
    }
    return json(
      { status: "ok" },
      {},
      { allowedOrigins: environment.ALLOWED_ORIGINS, request },
    );
  }
  if (request.method === "GET" && url.pathname === "/api/v1/system/compatibility") {
    return json(
      {
        api_version: "v1",
        current_schema_version: 1,
        maintenance_mode: false,
        minimum_client_version: "0.1.0",
        supported_schema_versions: [1],
      },
      {},
      { allowedOrigins: environment.ALLOWED_ORIGINS, request },
    );
  }
  if (!isDatabaseRoute(url.pathname)) {
    return errorResponse(new ApiError(404, "NOT_FOUND", "Endpoint tidak ditemukan."));
  }

  let database = dependencies.database;
  let ownsDatabase = false;
  try {
    if (database === undefined) {
      database = new PgRequestDatabase(environment);
      ownsDatabase = true;
    }
    if (url.pathname.startsWith("/api/v1/system/setup")) {
      return await routeSystemSetup(request, database, url, environment);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/sync/recovery-push"
    ) {
      return await routeRecoveryPush(request, database, environment);
    }
    return await routeAuthenticatedRequest(request, database, url, environment);
  } catch (error: unknown) {
    if (error instanceof DatabaseConfigurationError) {
      return errorResponse(
        new ApiError(503, error.code, "Database API belum dikonfigurasi."),
      );
    }
    return errorResponse(error);
  } finally {
    if (ownsDatabase && database !== undefined) {
      await database.close();
    }
  }
}

const worker = {
  fetch(request: Request, environment: ApiEnvironment): Promise<Response> {
    return handleRequest(request, environment);
  },
};

export default worker;
