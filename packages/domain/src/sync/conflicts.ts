import { ActorContext, SqlExecutor } from "../core/context.js";

export async function logSyncConflict(
  ctx: ActorContext,
  executor: SqlExecutor,
  conflictType: string,
  entityType: string,
  entityId: string,
  localVersion: number,
  serverVersion: number,
  localValue: unknown,
  serverValue: unknown
): Promise<string> {
  const sql = `
    INSERT INTO sync.conflicts
    (business_id, conflict_type, entity_type, entity_id, local_version, server_version, local_value, server_value, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UNRESOLVED')
    RETURNING id
  `;
  const res = await executor.query(sql, [
    ctx.business_id,
    conflictType,
    entityType,
    entityId,
    localVersion,
    serverVersion,
    JSON.stringify(localValue),
    JSON.stringify(serverValue)
  ]);
  return res.rows[0].id;
}
