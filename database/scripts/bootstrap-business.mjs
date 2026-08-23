// @ts-check

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { Client } from "pg";

import { requireDatabaseUrl, safeErrorMessage } from "./migrations.mjs";

const OWNER_ROLE_ID = "11111111-1111-4111-8111-111111111111";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** @param {string | undefined} value @param {string} name */
function requireText(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string.`);
  return normalized;
}

/** @param {string | undefined} value @param {string} name */
function requireUuid(value, name) {
  if (value === undefined || !UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be the UUID displayed by the POS login screen.`);
  }
  return value;
}

/** @param {string | undefined} value */
function parseTtlHours(value) {
  const ttl = value === undefined ? 12 : Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 720) {
    throw new Error("--ttl-hours must be an integer from 1 through 720.");
  }
  return ttl;
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      "business-name": { type: "string" },
      "confirm-create": { type: "boolean", default: false },
      "device-id": { type: "string" },
      "location-name": { type: "string", default: "Toko Utama" },
      "owner-email": { type: "string" },
      "owner-name": { type: "string" },
      "terminal-name": { type: "string", default: "Kasir 1" },
      timezone: { type: "string", default: "Asia/Makassar" },
      "ttl-hours": { type: "string" },
    },
    strict: true,
  });

  if (!values["confirm-create"]) {
    throw new Error(
      "Refusing to create operational data without the explicit --confirm-create flag.",
    );
  }

  const businessName = requireText(values["business-name"], "--business-name");
  const ownerName = requireText(values["owner-name"], "--owner-name");
  const deviceId = requireUuid(values["device-id"], "--device-id");
  const locationName = requireText(values["location-name"], "--location-name");
  const terminalName = requireText(values["terminal-name"], "--terminal-name");
  const timezone = requireText(values.timezone, "--timezone");
  const ttlHours = parseTtlHours(values["ttl-hours"]);
  const ownerEmail = values["owner-email"]?.trim() || null;
  const databaseUrl = requireDatabaseUrl();

  const ids = {
    audit: randomUUID(),
    business: randomUUID(),
    category: randomUUID(),
    device: deviceId,
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
    await client.query(
      `INSERT INTO identity.devices (
         id, business_id, device_key, name, platform, status
       ) VALUES ($1, $2, $3, $4, 'WEB_POS', 'ACTIVE')`,
      [ids.device, ids.business, `pos:${ids.device}`, terminalName],
    );
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
      `INSERT INTO catalog.categories (id, business_id, name, status)
       VALUES ($1, $2, 'Umum', 'ACTIVE')`,
      [ids.category, ids.business],
    );
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
        ids.device,
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
        ids.device,
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

  process.stdout.write(
    `${JSON.stringify(
      {
        business_id: ids.business,
        category_id: ids.category,
        device_id: ids.device,
        location_id: ids.location,
        membership_id: ids.membership,
        owner_user_id: ids.user,
        session_expires_in_hours: ttlHours,
        session_secret: sessionSecret,
        terminal_id: ids.terminal,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
