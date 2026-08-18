import { ActorContext, SqlExecutor } from "../core/context.js";

export async function checkIdempotency(
  ctx: ActorContext,
  executor: SqlExecutor,
  commandType: string,
  idempotencyKey: string,
  requestHash: string
): Promise<{ status: "PENDING" | "COMPLETED" | "FAILED", result_code?: string, response_payload?: unknown }> {
  const sql = `
    SELECT status, result_code, response_payload, request_hash
    FROM sync.idempotency_records
    WHERE business_id = $1 AND command_type = $2 AND idempotency_key = $3
  `;
  const res = await executor.query(sql, [ctx.business_id, commandType, idempotencyKey]);

  if (res.rows.length === 0) {
    // Attempt to lock/reserve
    try {
      await executor.query(`
        INSERT INTO sync.idempotency_records
        (business_id, idempotency_key, command_type, request_hash, status)
        VALUES ($1, $2, $3, $4, 'PENDING')
      `, [ctx.business_id, idempotencyKey, commandType, requestHash]);
      return { status: "PENDING" };
    } catch (e: any) {
      if (e.code === '23505') { // unique_violation
        // Another concurrent request beat us to it
        const checkRes = await executor.query(sql, [ctx.business_id, commandType, idempotencyKey]);
        if (checkRes.rows.length > 0) {
          const row = checkRes.rows[0];
          if (row.request_hash !== requestHash) {
            throw new Error("IDEMPOTENCY_KEY_REUSE_ERROR");
          }
          return {
            status: row.status,
            result_code: row.result_code,
            response_payload: row.response_payload,
          };
        }
      }
      throw e;
    }
  }

  const row = res.rows[0];
  if (row.request_hash !== requestHash) {
    throw new Error("IDEMPOTENCY_KEY_REUSE_ERROR");
  }

  return {
    status: row.status,
    result_code: row.result_code,
    response_payload: row.response_payload,
  };
}

export async function recordIdempotencyResult(
  ctx: ActorContext,
  executor: SqlExecutor,
  commandType: string,
  idempotencyKey: string,
  status: "COMPLETED" | "FAILED",
  resultCode: string,
  resultEntityType?: string,
  resultEntityId?: string,
  responsePayload?: unknown
): Promise<void> {
  const sql = `
    UPDATE sync.idempotency_records
    SET status = $1, result_code = $2, result_entity_type = $3, result_entity_id = $4, response_payload = $5, completed_at = now()
    WHERE business_id = $6 AND command_type = $7 AND idempotency_key = $8 AND status = 'PENDING'
  `;
  await executor.query(sql, [
    status,
    resultCode,
    resultEntityType ?? null,
    resultEntityId ?? null,
    responsePayload ? JSON.stringify(responsePayload) : null,
    ctx.business_id,
    commandType,
    idempotencyKey
  ]);
}
