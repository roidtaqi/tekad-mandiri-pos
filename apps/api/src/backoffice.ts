import type { AuthenticatedRequestContext } from "./auth.js";
import { requirePermission } from "./auth.js";
import type { SqlExecutor } from "./database.js";
import { ApiError, parsePositiveInteger } from "./http.js";

type BackofficeResource =
  | "attention"
  | "inventory"
  | "overview"
  | "pricing"
  | "purchases"
  | "reports"
  | "returns"
  | "sales"
  | "terminals"
  | "users";

const resourcePermissions: Readonly<Record<BackofficeResource, string>> = {
  attention: "workspace.backoffice.access",
  inventory: "inventory.read",
  overview: "workspace.backoffice.access",
  pricing: "pricing.read",
  purchases: "purchase.read",
  reports: "workspace.backoffice.access",
  returns: "return.read",
  sales: "transaction.history.read",
  terminals: "settings.read",
  users: "user.read",
};

export function isBackofficeResource(value: string): value is BackofficeResource {
  return value in resourcePermissions;
}

function limitFor(url: URL): number {
  return parsePositiveInteger(url.searchParams.get("limit"), 100, 500);
}

async function overview(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
): Promise<Readonly<Record<string, unknown>>> {
  const businessId = context.authorization.membership.business_id;
  const locationId = context.authorization.default_location_id;
  const [summary, attention] = await Promise.all([
    executor.query<{
      readonly active_products: number;
      readonly negative_stock_products: number;
      readonly open_purchases: number;
      readonly open_shift_count: number;
      readonly open_attention: number;
      readonly today_sales: string;
      readonly today_transactions: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM catalog.products
          WHERE business_id = $1 AND status = 'ACTIVE') AS active_products,
         (SELECT count(*)::integer FROM inventory.stock_balances
          WHERE business_id = $1 AND location_id = $2 AND base_quantity < 0) AS negative_stock_products,
         (SELECT count(*)::integer FROM purchasing.purchases
          WHERE business_id = $1 AND status NOT IN ('POSTED', 'CANCELLED')) AS open_purchases,
         (SELECT count(*)::integer FROM cash.shifts
          WHERE business_id = $1 AND status IN ('OPEN', 'CLOSING')) AS open_shift_count,
         (SELECT count(*)::integer FROM audit.business_exceptions
          WHERE business_id = $1 AND status IN ('OPEN', 'ACKNOWLEDGED')) AS open_attention,
         (SELECT COALESCE(sum(t.grand_total), 0)::text
          FROM sales.transactions t JOIN core.businesses b ON b.id = t.business_id
          WHERE t.business_id = $1 AND t.status = 'COMPLETED'
            AND t.occurred_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE b.timezone)
                AT TIME ZONE b.timezone) AS today_sales,
         (SELECT count(*)::integer
          FROM sales.transactions t JOIN core.businesses b ON b.id = t.business_id
          WHERE t.business_id = $1 AND t.status = 'COMPLETED'
            AND t.occurred_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE b.timezone)
                AT TIME ZONE b.timezone) AS today_transactions`,
      [businessId, locationId],
    ),
    executor.query(
      `SELECT id, domain, exception_type, severity, status, source_entity_type,
              source_entity_id, summary, impact_amount::text, impact_quantity::text,
              created_at
       FROM audit.business_exceptions
       WHERE business_id = $1 AND status IN ('OPEN', 'ACKNOWLEDGED')
       ORDER BY CASE severity
         WHEN 'CRITICAL' THEN 1 WHEN 'REVIEW_REQUIRED' THEN 2
         WHEN 'WARNING' THEN 3 ELSE 4 END, created_at DESC
       LIMIT 8`,
      [businessId],
    ),
  ]);

  return {
    attention: attention.rows,
    summary: summary.rows[0] ?? {
      active_products: 0,
      negative_stock_products: 0,
      open_attention: 0,
      open_purchases: 0,
      open_shift_count: 0,
      today_sales: "0.0000",
      today_transactions: 0,
    },
  };
}

async function listAttention(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `SELECT id, location_id, domain, exception_type, severity, status,
            source_entity_type, source_entity_id, summary, impact_amount::text,
            impact_quantity::text, metadata, created_at, acknowledged_at,
            resolved_at, resolution
     FROM audit.business_exceptions
     WHERE business_id = $1
     ORDER BY CASE severity
       WHEN 'CRITICAL' THEN 1 WHEN 'REVIEW_REQUIRED' THEN 2
       WHEN 'WARNING' THEN 3 ELSE 4 END, created_at DESC
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listPurchases(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `SELECT p.id, p.purchase_number, p.supplier_invoice_number, p.status,
            p.integrity_status, p.payment_status, p.purchase_date,
            p.ordered_at, p.received_at, p.posted_at, p.version::text,
            s.id AS supplier_id, s.name AS supplier_name,
            l.id AS location_id, l.name AS location_name,
            count(DISTINCT pi.id)::integer AS item_count,
            count(DISTINCT r.id)::integer AS receipt_count
     FROM purchasing.purchases p
     JOIN catalog.suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id
     JOIN core.locations l ON l.id = p.location_id AND l.business_id = p.business_id
     LEFT JOIN purchasing.purchase_items pi ON pi.purchase_id = p.id
     LEFT JOIN purchasing.receipts r ON r.purchase_id = p.id
     WHERE p.business_id = $1
     GROUP BY p.id, s.id, s.name, l.id, l.name
     ORDER BY p.created_at DESC, p.id
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listInventory(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  const canReadCost = context.authorization.permissions.includes("cost.read");
  return executor.query(
    `SELECT sb.product_id, p.sku, p.name AS product_name, p.base_unit_code,
            sb.location_id, l.name AS location_name, sb.base_quantity::text,
            sb.last_movement_id, sb.updated_at
            ${canReadCost ? ", pcs.mwa_unit_cost::text, pcs.pricing_reference_unit_cost::text" : ""}
     FROM inventory.stock_balances sb
     JOIN catalog.products p ON p.id = sb.product_id AND p.business_id = sb.business_id
     JOIN core.locations l ON l.id = sb.location_id AND l.business_id = sb.business_id
     ${canReadCost ? "LEFT JOIN costing.product_cost_states pcs ON pcs.business_id = sb.business_id AND pcs.location_id = sb.location_id AND pcs.product_id = sb.product_id" : ""}
     WHERE sb.business_id = $1
     ORDER BY (sb.base_quantity < 0) DESC, p.name ASC, sb.location_id
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listPricing(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `SELECT ps.id, ps.name, ps.source_type, ps.status, ps.proposed_by,
            ps.approved_by, ps.approved_at, ps.effective_from, ps.notes,
            ps.created_at, ps.updated_at, ps.version::text,
            count(ppi.id)::integer AS item_count,
            count(ppi.id) FILTER (WHERE ppi.risk_level IN ('HIGH', 'CRITICAL'))::integer
              AS high_risk_item_count
     FROM pricing.price_sets ps
     LEFT JOIN pricing.price_proposal_items ppi ON ppi.price_set_id = ps.id
     WHERE ps.business_id = $1
     GROUP BY ps.id
     ORDER BY ps.created_at DESC, ps.id
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listSales(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `WITH return_totals AS (
       SELECT original_transaction_id, sum(return_total) AS returned_total
       FROM returns.customer_returns
       WHERE business_id = $1 AND status = 'COMPLETED'
         AND original_transaction_id IS NOT NULL
       GROUP BY original_transaction_id
     )
     SELECT t.id, t.transaction_number, t.location_id, t.terminal_id, t.shift_id,
            t.status, t.subtotal::text, t.tax_total::text, t.grand_total::text,
            t.total_paid::text, t.change_amount::text, t.cost_status,
            t.occurred_at, t.completed_at, u.display_name AS cashier_name,
            count(DISTINCT ti.id)::integer AS item_count,
            COALESCE(rt.returned_total, 0)::text AS returned_total
     FROM sales.transactions t
     JOIN identity.users u ON u.id = t.created_by
     LEFT JOIN sales.transaction_items ti ON ti.transaction_id = t.id
     LEFT JOIN return_totals rt ON rt.original_transaction_id = t.id
     WHERE t.business_id = $1
     GROUP BY t.id, u.display_name, rt.returned_total
     ORDER BY t.occurred_at DESC, t.id
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listReturns(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `SELECT cr.id, cr.return_number, cr.original_transaction_id, cr.status,
            cr.refund_status, cr.return_total::text, cr.refunded_total::text,
            cr.reason_code, cr.notes, cr.created_at, cr.completed_at,
            t.transaction_number, count(ri.id)::integer AS item_count,
            refund_operation.refund_record_status,
            refund_operation.refund_id,
            refund_operation.refund_version
     FROM returns.customer_returns cr
     LEFT JOIN sales.transactions t ON t.id = cr.original_transaction_id
       AND t.business_id = cr.business_id
     LEFT JOIN returns.return_items ri ON ri.customer_return_id = cr.id
     LEFT JOIN LATERAL (
       SELECT r.id AS refund_id, r.version::text AS refund_version,
              r.status AS refund_record_status
       FROM returns.refunds r
       WHERE r.customer_return_id = cr.id
         AND r.business_id = cr.business_id
       ORDER BY CASE r.status
         WHEN 'REQUIRES_ACTION' THEN 1
         WHEN 'FAILED' THEN 2
         WHEN 'PENDING' THEN 3
         WHEN 'COMPLETED' THEN 4
         WHEN 'REVERSED' THEN 5
         ELSE 6
       END, r.requested_at DESC, r.id
       LIMIT 1
     ) refund_operation ON TRUE
     WHERE cr.business_id = $1
     GROUP BY cr.id, t.transaction_number, refund_operation.refund_record_status,
              refund_operation.refund_id, refund_operation.refund_version
     ORDER BY cr.created_at DESC, cr.id
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listReports(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `WITH sale_days AS (
       SELECT (t.occurred_at AT TIME ZONE b.timezone)::date AS business_date,
              count(*)::integer AS transaction_count,
              sum(t.grand_total) AS gross_sales
       FROM sales.transactions t
       JOIN core.businesses b ON b.id = t.business_id
       WHERE t.business_id = $1 AND t.status = 'COMPLETED'
       GROUP BY (t.occurred_at AT TIME ZONE b.timezone)::date
     ), return_days AS (
       SELECT (cr.completed_at AT TIME ZONE b.timezone)::date AS business_date,
              sum(cr.return_total) AS returns_total
       FROM returns.customer_returns cr
       JOIN core.businesses b ON b.id = cr.business_id
       WHERE cr.business_id = $1 AND cr.status = 'COMPLETED'
       GROUP BY (cr.completed_at AT TIME ZONE b.timezone)::date
     )
     SELECT sd.business_date, sd.transaction_count, sd.gross_sales::text,
            COALESCE(rd.returns_total, 0)::text AS returns_total,
            (sd.gross_sales - COALESCE(rd.returns_total, 0))::text AS net_sales
     FROM sale_days sd LEFT JOIN return_days rd USING (business_date)
     ORDER BY sd.business_date DESC
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listUsers(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `SELECT u.id, u.display_name, u.email, u.phone, u.status AS user_status,
            m.id AS membership_id, m.status AS membership_status,
            m.version::text AS membership_version, r.code AS primary_role,
            COALESCE(av.version, 1)::text AS authorization_version,
            count(s.id) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP)::integer
              AS active_session_count
     FROM identity.business_memberships m
     JOIN identity.users u ON u.id = m.user_id
     LEFT JOIN identity.authorization_versions av ON av.membership_id = m.id
     LEFT JOIN identity.membership_roles mr ON mr.membership_id = m.id AND mr.is_primary = TRUE
     LEFT JOIN identity.roles r ON r.id = mr.role_id
     LEFT JOIN identity.sessions s ON s.business_id = m.business_id AND s.user_id = m.user_id
     WHERE m.business_id = $1
     GROUP BY u.id, m.id, r.code, av.version
     ORDER BY u.display_name ASC, u.id
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

async function listTerminals(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  limit: number,
) {
  return executor.query(
    `SELECT t.id, t.location_id, l.name AS location_name, t.code, t.name,
            t.status, t.version::text, s.id AS active_shift_id,
            s.shift_number AS active_shift_number, s.cashier_user_id,
            s.opened_at AS shift_opened_at
     FROM core.terminals t
     JOIN core.locations l ON l.id = t.location_id AND l.business_id = t.business_id
     LEFT JOIN cash.shifts s ON s.business_id = t.business_id AND s.terminal_id = t.id
       AND s.status IN ('OPEN', 'CLOSING')
     WHERE t.business_id = $1
     ORDER BY l.name, t.code
     LIMIT $2`,
    [context.authorization.membership.business_id, limit],
  );
}

export async function queryBackofficeResource(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  resource: string,
  url: URL,
): Promise<unknown> {
  if (!isBackofficeResource(resource)) {
    throw new ApiError(404, "NOT_FOUND", "Resource Back Office tidak ditemukan.");
  }
  requirePermission(context, "workspace.backoffice.access");
  requirePermission(context, resourcePermissions[resource]);
  const limit = limitFor(url);

  if (resource === "overview") return overview(executor, context);
  const result =
    resource === "attention"
      ? await listAttention(executor, context, limit)
      : resource === "purchases"
        ? await listPurchases(executor, context, limit)
        : resource === "inventory"
          ? await listInventory(executor, context, limit)
          : resource === "pricing"
            ? await listPricing(executor, context, limit)
            : resource === "sales"
              ? await listSales(executor, context, limit)
              : resource === "returns"
                ? await listReturns(executor, context, limit)
                : resource === "reports"
                  ? await listReports(executor, context, limit)
                  : resource === "users"
                    ? await listUsers(executor, context, limit)
                    : await listTerminals(executor, context, limit);
  return { items: result.rows };
}
