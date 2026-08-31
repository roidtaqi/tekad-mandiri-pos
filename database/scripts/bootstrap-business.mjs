import { createHash, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { Client } from "pg";

import { requireDatabaseUrl, safeErrorMessage } from "./migrations.mjs";

const OWNER_ROLE_ID = "11111111-1111-4111-8111-111111111111";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** @param {string | boolean | undefined} value @param {string} fallback */
function textOrDefault(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

/** @param {string | boolean | undefined} value @param {string} name */
function optionalUuid(value, name) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  if (!UUID_PATTERN.test(value.trim())) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return value.trim();
}

/** @param {string | boolean | undefined} value */
function parseTtlHours(value) {
  if (value === undefined || typeof value === "boolean") return 720;
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 8760) {
    throw new Error("--ttl-hours must be an integer from 1 through 8760 (up to 365 days).");
  }
  return ttl;
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      "business-name": { type: "string" },
      "confirm-create": { type: "boolean", default: true },
      "device-id": { type: "string" },
      "location-name": { type: "string", default: "Toko Utama" },
      "owner-email": { type: "string" },
      "owner-name": { type: "string" },
      "owner-password": { type: "string" },
      "terminal-name": { type: "string", default: "Kasir 1" },
      timezone: { type: "string", default: "Asia/Makassar" },
      "ttl-hours": { type: "string" },
    },
    strict: false,
  });

  const businessName = textOrDefault(values["business-name"], "Kastur Retail");
  const ownerName = textOrDefault(values["owner-name"], "Owner");
  const ownerEmail = textOrDefault(values["owner-email"], "owner@kastur.local");
  const ownerPassword = textOrDefault(values["owner-password"], "Password123!");
  const locationName = textOrDefault(values["location-name"], "Toko Utama");
  const terminalName = textOrDefault(values["terminal-name"], "Kasir 1");
  const timezone = textOrDefault(values.timezone, "Asia/Makassar");
  const ttlHours = parseTtlHours(values["ttl-hours"]);
  const explicitDeviceId = optionalUuid(values["device-id"], "--device-id");
  const databaseUrl = requireDatabaseUrl();

  const ids = {
    audit: randomUUID(),
    business: randomUUID(),
    category: randomUUID(),
    device: explicitDeviceId || randomUUID(),
    location: randomUUID(),
    membership: randomUUID(),
    payment_method: randomUUID(),
    session: randomUUID(),
    terminal: randomUUID(),
    user: randomUUID(),
  };
  const correlationId = randomUUID();
  const sessionSecret = randomBytes(32).toString("base64url");
  const sessionHash = createHash("sha256").update(sessionSecret).digest("hex");
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query("BEGIN");

    // Check if business already exists
    const existing = await client.query(
      `SELECT id, name FROM core.businesses WHERE status = 'ACTIVE' LIMIT 1`,
    );
    if (existing.rowCount && existing.rowCount > 0) {
      process.stdout.write(
        `⚠️  Business '${existing.rows[0].name}' (${existing.rows[0].id}) already exists.\n`,
      );
      process.stdout.write(
        `Use 'npm run db:session:issue' to issue an additional session token.\n`,
      );
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `INSERT INTO core.businesses (id, name, currency_code, timezone, status)
       VALUES ($1, $2, 'IDR', $3, 'ACTIVE')`,
      [ids.business, businessName, timezone],
    );
    await client.query(
      `INSERT INTO core.locations (
         id, business_id, code, name, type, is_default, status
       ) VALUES ($1, $2, 'MAIN', $3, 'STORE', TRUE, 'ACTIVE')`,
      [ids.location, ids.business, locationName],
    );
    await client.query(
      `INSERT INTO identity.users (id, display_name, email, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [ids.user, ownerName, ownerEmail],
    );
    const saltHex = randomBytes(16).toString("hex");
    const passwordHashHex = pbkdf2Sync(
      ownerPassword,
      Buffer.from(saltHex, "hex"),
      100000,
      32,
      "sha256",
    ).toString("hex");
    await client.query(
      `INSERT INTO identity.password_credentials (
         user_id, password_hash, password_salt, algorithm, iterations
       ) VALUES ($1, $2, $3, 'PBKDF2_SHA256', 100000)`,
      [ids.user, passwordHashHex, saltHex],
    );
    await client.query(
      `INSERT INTO identity.business_memberships (id, business_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [ids.membership, ids.business, ids.user],
    );
    await client.query(
      `INSERT INTO identity.membership_roles (
         membership_id, role_id, is_primary, assigned_by
       ) VALUES ($1, $2, TRUE, $3)`,
      [ids.membership, OWNER_ROLE_ID, ids.user],
    );
    await client.query(
      `INSERT INTO identity.authorization_versions (membership_id, version)
       VALUES ($1, 1)`,
      [ids.membership],
    );
    if (explicitDeviceId) {
      await client.query(
        `INSERT INTO identity.devices (
           id, business_id, code, display_name, device_type, status
         ) VALUES ($1, $2, $3, $4, 'PWA', 'ACTIVE')`,
        [ids.device, ids.business, `DEV-${ids.device.slice(0, 8)}`, terminalName],
      );
    }
    await client.query(
      `INSERT INTO core.terminals (
         id, business_id, location_id, code, name, status
       ) VALUES ($1, $2, $3, 'POS-1', $4, 'ACTIVE')`,
      [ids.terminal, ids.business, ids.location, terminalName],
    );
    await client.query(
      `INSERT INTO sales.payment_methods (
         id, business_id, code, name, is_cash, offline_allowed,
         requires_reference, status
       ) VALUES ($1, $2, 'CASH', 'Tunai', TRUE, TRUE, FALSE, 'ACTIVE')`,
      [ids.payment_method, ids.business],
    );
    await client.query(
      `INSERT INTO catalog.categories (id, business_id, code, name, status)
       VALUES ($1, $2, 'GENERAL', 'Umum', 'ACTIVE')`,
      [ids.category, ids.business],
    );
    // If device was explicitly given, bind session to it; otherwise leave unbound so it can be used for Back Office & first POS!
    const sessionDeviceId = explicitDeviceId ? ids.device : null;
    await client.query(
      `INSERT INTO identity.sessions (
         id, user_id, business_id, device_id, session_secret_hash,
         issued_at, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP + ($6::text || ' hours')::interval
       )`,
      [
        ids.session,
        ids.user,
        ids.business,
        sessionDeviceId,
        sessionHash,
        String(ttlHours),
      ],
    );
    await client.query(
      `INSERT INTO audit.audit_events (
         id, business_id, location_id, actor_type, actor_user_id,
         actor_role_snapshot, action, entity_type, entity_id, occurred_at,
         device_id, session_id, reason, after_data, correlation_id,
         authorization_version
       ) VALUES (
         $1, $2, $3, 'USER', $4, 'OWNER', 'BUSINESS_BOOTSTRAPPED',
         'business', $2, CURRENT_TIMESTAMP, $5, $6,
         'Explicit bootstrap-business command', $7::jsonb, $8, 1
       )`,
      [
        ids.audit,
        ids.business,
        ids.location,
        ids.user,
        sessionDeviceId,
        ids.session,
        JSON.stringify({
          business_name: businessName,
          location_id: ids.location,
          terminal_id: ids.terminal,
        }),
        correlationId,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  process.stdout.write(`
============================================================
  KASTUR RETAIL SYSTEM v2 — INITIAL BUSINESS READY
============================================================
  Business:     ${businessName} (${timezone})
  Location:     ${locationName}
  Terminal:     ${terminalName}
  Owner:        ${ownerName} (${ownerEmail})

  🔑 OWNER SESSION SECRET:
  ${sessionSecret}

  Gunakan kode sesi di atas untuk masuk ke:
  - Back Office: Tempel kode sesi saat diminta
  - POS:         Tempel kode sesi (terminal & device terikat otomatis)
============================================================
`);
}

main().catch((error) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
