// @ts-check

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { Client } from "pg";

import { requireDatabaseUrl, safeErrorMessage } from "./migrations.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
      "business-id": { type: "string" },
      "device-id": { type: "string" },
      "ttl-hours": { type: "string" },
      "user-id": { type: "string" },
    },
    strict: false,
  });

  const explicitBusinessId = optionalUuid(values["business-id"], "--business-id");
  const explicitDeviceId = optionalUuid(values["device-id"], "--device-id");
  const explicitUserId = optionalUuid(values["user-id"], "--user-id");
  const ttlHours = parseTtlHours(values["ttl-hours"]);
  const databaseUrl = requireDatabaseUrl();
  const sessionSecret = randomBytes(32).toString("base64url");
  const sessionHash = createHash("sha256").update(sessionSecret).digest("hex");
  const sessionId = randomUUID();
  const client = new Client({ connectionString: databaseUrl });

  let businessId = explicitBusinessId;
  let userId = explicitUserId;
  let userName = "User";

  try {
    await client.connect();
    await client.query("BEGIN");

    // Auto-resolve business if not specified
    if (!businessId) {
      const businessRes = await client.query(
        `SELECT id, name FROM core.businesses WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1`,
      );
      if (businessRes.rowCount === 0) {
        throw new Error("No active business found in database. Run bootstrap first.");
      }
      businessId = businessRes.rows[0].id;
    }

    // Auto-resolve user if not specified
    if (!userId) {
      const userRes = await client.query(
        `SELECT u.id, u.display_name
         FROM identity.users u
         JOIN identity.business_memberships m ON m.user_id = u.id
         WHERE m.business_id = $1 AND u.status = 'ACTIVE' AND m.status = 'ACTIVE'
         ORDER BY m.created_at ASC LIMIT 1`,
        [businessId],
      );
      if (userRes.rowCount === 0) {
        throw new Error("No active user found for this business.");
      }
      userId = userRes.rows[0].id;
      userName = userRes.rows[0].display_name;
    } else {
      const userRes = await client.query(
        `SELECT u.display_name FROM identity.users u WHERE u.id = $1`,
        [userId],
      );
      if (userRes.rowCount && userRes.rowCount > 0) {
        userName = userRes.rows[0].display_name;
      }
    }

    // Handle device
    let deviceId = explicitDeviceId || null;
    if (deviceId) {
      // Check or register device
      await client.query(
        `INSERT INTO identity.devices (id, business_id, device_key, name, platform, status)
         VALUES ($1, $2, $3, 'POS Terminal', 'PWA', 'ACTIVE')
         ON CONFLICT (id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP WHERE identity.devices.business_id = $2`,
      );
    }

    await client.query(
      `INSERT INTO identity.sessions (
         id, user_id, business_id, device_id, session_secret_hash,
         issued_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP,
                 CURRENT_TIMESTAMP + ($6::text || ' hours')::interval)`,
      [sessionId, userId, businessId, deviceId, sessionHash, String(ttlHours)],
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
  KASTUR RETAIL SYSTEM v2 — SESSION ISSUED
============================================================
  User:         ${userName} (${userId})
  Business ID:  ${businessId}
  Device ID:    ${explicitDeviceId || "Unbound (auto-binds on first POS login or valid for Back Office)"}
  Valid for:    ${ttlHours} hours (${Math.round(ttlHours / 24)} days)

  🔑 SESSION SECRET:
  ${sessionSecret}
============================================================
`);
}

main().catch((error) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
