import { ActorContext, SqlExecutor } from "../core/context.js";

export async function appendChange(
  ctx: ActorContext,
  executor: SqlExecutor,
  entityType: string,
  entityId: string,
  changeType: "UPSERT" | "DELETE",
  entityVersion?: number,
  payload?: unknown,
  correlationId?: string
): Promise<string> {
  const sql = `
    INSERT INTO sync.change_feed
    (business_id, entity_type, entity_id, change_type, entity_version, payload, occurred_at, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
    RETURNING sequence
  `;
  const res = await executor.query(sql, [
    ctx.business_id,
    entityType,
    entityId,
    changeType,
    entityVersion ?? null,
    payload ? JSON.stringify(payload) : null,
    correlationId ?? null
  ]);
  return res.rows[0].sequence.toString();
}

export async function pullChanges(
  ctx: ActorContext,
  executor: SqlExecutor,
  afterSequence: string,
  limit: number = 100
): Promise<any[]> {
  const sql = `
    SELECT sequence, entity_type, entity_id, change_type, entity_version, payload, occurred_at, correlation_id
    FROM sync.change_feed
    WHERE business_id = $1 AND sequence > $2
    ORDER BY sequence ASC
    LIMIT $3
  `;
  const res = await executor.query(sql, [ctx.business_id, afterSequence, limit]);
  return res.rows.map((row: any) => ({
    sequence: row.sequence.toString(),
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    change_type: row.change_type,
    entity_version: row.entity_version,
    payload: row.payload,
    occurred_at: row.occurred_at.toISOString(),
    correlation_id: row.correlation_id,
  }));
}
