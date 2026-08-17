import { PosPublishedRetailPriceBootstrapSnapshot } from "@kastur/contracts";
import { ActorContext, SqlExecutor } from "../core/context.js";
import { createPricingPermissionError } from "./errors.js";
import { serializePosPublishedRetailPriceBootstrapSnapshot } from "./serializers.js";

export async function buildPosPublishedRetailPriceBootstrapProjection(
  ctx: ActorContext,
  executor: SqlExecutor,
  serverTime: string
): Promise<PosPublishedRetailPriceBootstrapSnapshot> {
  if (!ctx.permissions.has("workspace.pos.access")) {
    throw createPricingPermissionError();
  }

  const res = await executor.query(`
    SELECT 
      pv.id as price_version_id,
      pv.product_unit_id,
      ptv.unit_price,
      pv.effective_from,
      pv.effective_to
    FROM pricing.price_versions pv
    JOIN pricing.price_tier_versions ptv ON pv.id = ptv.price_version_id
    WHERE pv.business_id = $1
      AND pv.status = 'ACTIVE'
      AND pv.effective_from <= $2
      AND (pv.effective_to IS NULL OR $2 < pv.effective_to)
      AND ptv.tier_code = 'RETAIL'
      AND ptv.min_qty = 1
    ORDER BY pv.product_unit_id ASC
  `, [ctx.business_id, serverTime]);

  return serializePosPublishedRetailPriceBootstrapSnapshot(ctx, serverTime, res.rows);
}
