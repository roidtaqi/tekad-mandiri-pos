// @ts-check

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { Client } from "pg";

import { requireDatabaseUrl, safeErrorMessage } from "./migrations.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** @param {string | undefined} value @param {string} name */
function requireUuid(value, name) {
  if (value === undefined || !UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be an explicit UUID.`);
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
      "business-id": { type: "string" },
      "device-id": { type: "string" },
      "ttl-hours": { type: "string" },
      "user-id": { type: "string" },
    },
    strict: true,
  });
  const businessId = requireUuid(values["business-id"], "--business-id");
  const deviceId = requireUuid(values["device-id"], "--device-id");
  const userId = requireUuid(values["user-id"], "--user-id");
  const ttlHours = parseTtlHours(values["ttl-hours"]);
  const databaseUrl = requireDatabaseUrl();
  const sessionSecret = randomBytes(32).toString("base64url");
  const sessionHash = createHash("sha256").update(sessionSecret).digest("hex");
  const sessionId = randomUUID();
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query("BEGIN");
    const context = await client.query(
      `SELECT m.id AS membership_id, d.status AS device_status
       FROM identity.business_memberships m
       JOIN identity.users u ON u.id = m.user_id
       JOIN identity.devices d ON d.id = $3 AND d.business_id = m.business_id
       WHERE m.business_id = $1 AND m.user_id = $2
         AND m.status = 'ACTIVE' AND u.status = 'ACTIVE'
       FOR UPDATE`,
      [businessId, userId, deviceId],
    );
    if (context.rowCount !== 1 || context.rows[0]?.device_status !== "ACTIVE") {
      throw new Error("Active membership and active same-business device are required.");
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

  process.stdout.write(
    `${JSON.stringify(
      {
        business_id: businessId,
        device_id: deviceId,
        expires_in_hours: ttlHours,
        session_id: sessionId,
        session_secret: sessionSecret,
        user_id: userId,
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
