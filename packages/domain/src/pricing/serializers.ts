import { PosPublishedRetailPrice, PosPublishedRetailPriceBootstrapSnapshot } from "@kastur/contracts";
import { ActorContext } from "../core/context.js";

export function serializePosPublishedRetailPrice(row: any): PosPublishedRetailPrice {
  if (typeof row.price_version_id !== "string") throw new Error("price_version_id must be string");
  if (typeof row.product_unit_id !== "string") throw new Error("product_unit_id must be string");
  if (typeof row.unit_price !== "string") throw new Error("unit_price must be string");

  let effTo = null;
  if (row.effective_to !== null) {
    if (row.effective_to instanceof Date) effTo = row.effective_to.toISOString();
    else if (typeof row.effective_to === "string") effTo = row.effective_to;
    else throw new Error("effective_to must be Date, string, or strict null");
  }

  let effFrom = "";
  if (row.effective_from instanceof Date) effFrom = row.effective_from.toISOString();
  else if (typeof row.effective_from === "string") effFrom = row.effective_from;
  else throw new Error("effective_from must be Date or string");

  return {
    price_version_id: row.price_version_id,
    product_unit_id: row.product_unit_id,
    unit_price: row.unit_price,
    effective_from: effFrom,
    effective_to: effTo
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
