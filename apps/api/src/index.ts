import {
  SYSTEM_HEALTH_PATH,
  type SystemHealthResponse,
} from "@kastur/contracts";

import {
  authenticateRecoveryRequest,
  authenticateRequest,
  revokeCurrentSession,
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
    pathname.startsWith("/api/v1/sync/")
  );
}

async function routeAuthenticatedRequest(
  request: Request,
  database: RequestDatabase,
  url: URL,
  environment: ApiEnvironment,
): Promise<Response> {
  const context = await authenticateRequest(request, database, environment);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/v1/auth/context") {
    return json({ data: context.authorization, meta: { server_time: new Date().toISOString() } });
  }
  if (request.method === "POST" && pathname === "/api/v1/auth/logout") {
    await revokeCurrentSession(database, context);
    return new Response(null, { headers: jsonHeaders, status: 204 });
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
    });
  }
  if (request.method === "GET" && pathname === "/api/v1/catalog/products") {
    return json({ data: await listProducts(database, context, url) });
  }
  const productMatch = pathname.match(/^\/api\/v1\/catalog\/products\/([^/]+)$/u);
  if (request.method === "GET" && productMatch?.[1] !== undefined) {
    return json({ data: await getProduct(database, context, productMatch[1]) });
  }
  if (request.method === "POST" && pathname === "/api/v1/catalog/products") {
    return json({ data: await createProduct(request, database, context) }, { status: 201 });
  }
  if (request.method === "POST" && pathname === "/api/v1/commands") {
    return json(await executeOnlineCommand(request, database, context));
  }
  if (request.method === "GET" && pathname === "/api/v1/returns/sales") {
    return json({
      data: await listReturnableSales(database, context, url),
      meta: { server_time: new Date().toISOString() },
    });
  }
  const returnableSaleMatch = pathname.match(/^\/api\/v1\/returns\/sales\/([^/]+)$/u);
  if (request.method === "GET" && returnableSaleMatch?.[1] !== undefined) {
    return json({
      data: await getReturnableSale(database, context, returnableSaleMatch[1]),
      meta: { server_time: new Date().toISOString() },
    });
  }
  if (request.method === "GET" && pathname === "/api/v1/catalog/categories") {
    return json({ data: await listCatalogOptions(database, context, "categories") });
  }
  if (request.method === "GET" && pathname === "/api/v1/catalog/brands") {
    return json({ data: await listCatalogOptions(database, context, "brands") });
  }
  if (request.method === "GET" && pathname === "/api/v1/sync/bootstrap") {
    return json(await bootstrap(database, context, url, request));
  }
  if (request.method === "POST" && pathname === "/api/v1/sync/push") {
    return json(await push(request, database, context, { environment }));
  }
  if (request.method === "GET" && pathname === "/api/v1/sync/pull") {
    return json(await pull(database, context, url));
  }
  if (request.method === "POST" && pathname === "/api/v1/sync/ack") {
    return json(await acknowledge(request, database, context));
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
  return json(result);
}

export async function handleRequest(
  request: Request,
  environment: ApiEnvironment = {},
  dependencies: ApiDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === SYSTEM_HEALTH_PATH) {
    const body = { status: "ok" } satisfies SystemHealthResponse;
    return json(body);
  }
  if (request.method === "GET" && url.pathname === "/api/v1/system/compatibility") {
    return json({
      api_version: "v1",
      current_schema_version: 1,
      maintenance_mode: false,
      minimum_client_version: "0.1.0",
      supported_schema_versions: [1],
    });
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
