import { PosPublishedRetailPrice, PosPublishedRetailPriceBootstrapSnapshot } from "@kastur/contracts";
import { ActorContext } from "../core/context.js";

export function serializePosPublishedRetailPrice(row: any): PosPublishedRetailPrice {
  return {
    price_version_id: String(row.price_version_id),
    product_unit_id: String(row.product_unit_id),
    unit_price: String(row.unit_price),
    effective_from: row.effective_from instanceof Date ? row.effective_from.toISOString() : String(row.effective_from),
    effective_to: row.effective_to ? (row.effective_to instanceof Date ? row.effective_to.toISOString() : String(row.effective_to)) : null
  };
}

export function serializePosPublishedRetailPriceBootstrapSnapshot(
  ctx: ActorContext,
  serverTime: string,
  rows: any[]
): PosPublishedRetailPriceBootstrapSnapshot {
  return {
    bootstrap_version: 1,
    business_id: ctx.business_id,
    server_time: serverTime,
    prices: rows.map(serializePosPublishedRetailPrice)
  };
}
