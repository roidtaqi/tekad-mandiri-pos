import { ActorContext, SqlExecutor } from "../core/context.js";

export async function updateDeviceSyncState(
  ctx: ActorContext,
  executor: SqlExecutor,
  deviceId: string,
  lastAckSequence: string,
  clientVersion: string,
  schemaVersion: number
): Promise<void> {
  const sql = `
    INSERT INTO sync.device_sync_states
    (business_id, device_id, last_ack_sequence, client_version, schema_version, last_pull_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (business_id, device_id)
    DO UPDATE SET
      last_ack_sequence = EXCLUDED.last_ack_sequence,
      client_version = EXCLUDED.client_version,
      schema_version = EXCLUDED.schema_version,
      last_pull_at = EXCLUDED.last_pull_at
  `;
  await executor.query(sql, [
    ctx.business_id,
    deviceId,
    lastAckSequence,
    clientVersion,
    schemaVersion
  ]);
}
