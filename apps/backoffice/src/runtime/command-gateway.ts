import type { AuthContextResponse } from "@kastur/contracts";

import { AuthenticatedHttpClient, HttpError } from "./http";

export interface CommandIdentityInput {
  readonly commandId: string;
  readonly correlationId: string;
  readonly deviceId: string;
  readonly occurredAt: string;
}

export interface PurchaseCreatePayload {
  readonly purchase_id: string;
  readonly purchase_number: string;
  readonly purchase_date: string;
  readonly supplier_id: string;
  readonly notes: string | null;
  readonly items: readonly {
    readonly item_id: string;
    readonly product_id: string;
    readonly product_unit_id: string;
    readonly expected_qty: string;
    readonly conversion_snapshot: string;
    readonly agreed_unit_price: string | null;
    readonly agreed_discount_amount: string;
    readonly agreed_free_qty: string;
  }[];
}

export interface PurchaseReceiptPayload {
  readonly purchase_id: string;
  readonly receipt_id: string;
  readonly receipt_number: string;
  readonly received_at: string;
  readonly notes: string | null;
  readonly items: readonly {
    readonly receipt_item_id: string;
    readonly purchase_item_id: string;
    readonly product_id: string;
    readonly product_unit_id: string;
    readonly received_qty: string;
    readonly accepted_qty: string;
    readonly rejected_qty: string;
    readonly free_qty_received: string;
    readonly conversion_snapshot: string;
    readonly rejection_reason: string | null;
  }[];
}

export interface PurchaseInvoicePayload {
  readonly purchase_id: string;
  readonly invoice_id: string;
  readonly supplier_invoice_number: string | null;
  readonly invoice_date: string | null;
  readonly captured_at: string;
  readonly expected_invoice_version: number;
  readonly expected_purchase_version: number;
  readonly subtotal: string;
  readonly item_discount_total: string;
  readonly global_discount_total: string;
  readonly tax_total: string;
  readonly acquisition_charge_total: string;
  readonly grand_total: string;
  readonly items: readonly {
    readonly invoice_item_id: string;
    readonly purchase_item_id: string;
    readonly invoiced_qty: string;
    readonly free_qty: string;
    readonly unit_price: string;
    readonly item_discount_amount: string;
    readonly tax_amount: string;
  }[];
  readonly charges: readonly {
    readonly charge_id: string;
    readonly type: "FREIGHT" | "HANDLING" | "NON_RECOVERABLE_TAX" | "OTHER_DIRECT_ACQUISITION";
    readonly amount: string;
    readonly allocation_method: "BY_ITEM_VALUE";
    readonly description: string | null;
  }[];
}

export interface PurchasePostPayload {
  readonly purchase_id: string;
  readonly expected_version: number;
  readonly accepted_integrity_exception_ids: readonly string[];
  readonly notes: string | null;
}

export interface PriceProposalCreatePayload {
  readonly price_set_id: string;
  readonly name: string | null;
  readonly source_type: string;
  readonly notes: string | null;
  readonly items: readonly {
    readonly proposal_item_id: string;
    readonly product_unit_id: string;
    readonly current_price_snapshot: string | null;
    readonly pricing_reference_cost_snapshot: string | null;
    readonly target_margin_snapshot: string | null;
    readonly minimum_margin_snapshot: string | null;
    readonly recommended_price: string | null;
    readonly proposed_price: string;
    readonly calculated_margin: string | null;
    readonly risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }[];
}

export interface PriceProposalSubmitPayload {
  readonly price_set_id: string;
  readonly expected_version: number;
}

export interface PriceProposalApprovePayload {
  readonly price_set_id: string;
  readonly expected_version: number;
  readonly effective_from: string;
  readonly owner_reason: string | null;
  readonly items: readonly {
    readonly proposal_item_id: string;
    readonly final_approved_price: string;
    readonly price_version_id: string | null;
    readonly tiers: readonly {
      readonly tier_id: string | null;
      readonly tier_code: string;
      readonly min_qty: string;
      readonly unit_price: string;
      readonly sort_order: number;
    }[];
  }[];
}

export interface PromotionPublishPayload {
  readonly promotion_id: string;
  readonly product_unit_id: string;
  readonly name: string;
  readonly promotion_type: "FIXED_PRICE" | "PERCENT_DISCOUNT" | "FIXED_DISCOUNT";
  readonly value: string;
  readonly min_qty: string;
  readonly priority: number;
  readonly effective_from: string;
  readonly effective_to: string;
  readonly owner_reason: string | null;
}

export interface InventoryAdjustmentPayload {
  readonly adjustment_id: string;
  readonly adjustment_number: string;
  readonly direction: "IN" | "OUT";
  readonly reason_code: "DAMAGED" | "LOST" | "FOUND" | "DATA_CORRECTION" | "EXPIRED" | "OTHER";
  readonly notes: string | null;
  readonly items: readonly {
    readonly item_id: string;
    readonly product_id: string;
    readonly product_unit_id: string;
    readonly quantity: string;
    readonly conversion_snapshot: string;
  }[];
}

export interface OpnameCreatePayload {
  readonly opname_id: string;
  readonly opname_number: string;
  readonly scope_type: string;
  readonly product_ids: readonly string[];
}

export interface OpnameCountPayload {
  readonly opname_id: string;
  readonly expected_version: number;
  readonly items: readonly {
    readonly product_id: string;
    readonly physical_qty: string;
    readonly counted_at: string;
  }[];
}

export interface OpnameTransitionPayload {
  readonly opname_id: string;
  readonly expected_version: number;
  readonly notes: string | null;
}

export interface RefundRetryPayload {
  readonly refund_id: string;
  readonly expected_version: number;
  readonly reason: string;
}

export interface RefundResolvePayload {
  readonly refund_id: string;
  readonly expected_version: number;
  readonly resolution_status: "COMPLETED" | "FAILED" | "REQUIRES_ACTION";
  readonly external_reference: string | null;
  readonly reason: string;
  readonly shift_id?: string;
  readonly terminal_id?: string;
}

export interface RefundReversePayload {
  readonly refund_id: string;
  readonly expected_version: number;
  readonly reason: string;
  readonly shift_id?: string;
  readonly terminal_id?: string;
}

export interface OperationalCommandResult {
  readonly command_id: string;
  readonly result: Readonly<Record<string, unknown>>;
  readonly server_time: string;
}

export interface BackofficeCommandGateway {
  createPurchase(identity: CommandIdentityInput, payload: PurchaseCreatePayload): Promise<OperationalCommandResult>;
  receivePurchase(identity: CommandIdentityInput, payload: PurchaseReceiptPayload): Promise<OperationalCommandResult>;
  capturePurchaseInvoice(identity: CommandIdentityInput, payload: PurchaseInvoicePayload): Promise<OperationalCommandResult>;
  postPurchase(identity: CommandIdentityInput, payload: PurchasePostPayload): Promise<OperationalCommandResult>;
  createPriceProposal(identity: CommandIdentityInput, payload: PriceProposalCreatePayload): Promise<OperationalCommandResult>;
  submitPriceProposal(identity: CommandIdentityInput, payload: PriceProposalSubmitPayload): Promise<OperationalCommandResult>;
  approvePriceProposal(identity: CommandIdentityInput, payload: PriceProposalApprovePayload): Promise<OperationalCommandResult>;
  publishPromotion(identity: CommandIdentityInput, payload: PromotionPublishPayload): Promise<OperationalCommandResult>;
  adjustInventory(identity: CommandIdentityInput, payload: InventoryAdjustmentPayload): Promise<OperationalCommandResult>;
  createOpname(identity: CommandIdentityInput, payload: OpnameCreatePayload): Promise<OperationalCommandResult>;
  countOpname(identity: CommandIdentityInput, payload: OpnameCountPayload): Promise<OperationalCommandResult>;
  recountOpname(identity: CommandIdentityInput, payload: OpnameCountPayload): Promise<OperationalCommandResult>;
  reviewOpname(identity: CommandIdentityInput, payload: OpnameTransitionPayload): Promise<OperationalCommandResult>;
  postOpname(identity: CommandIdentityInput, payload: OpnameTransitionPayload): Promise<OperationalCommandResult>;
  resolveRefund(identity: CommandIdentityInput, payload: RefundResolvePayload): Promise<OperationalCommandResult>;
  retryRefund(identity: CommandIdentityInput, payload: RefundRetryPayload): Promise<OperationalCommandResult>;
  reverseRefund(identity: CommandIdentityInput, payload: RefundReversePayload): Promise<OperationalCommandResult>;
}

function record(value: unknown, field: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(502, "INVALID_API_RESPONSE", `${field} tidak dapat dibaca.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function parseResult(value: unknown): OperationalCommandResult {
  const envelope = record(value, "Respons command");
  if (
    typeof envelope.command_id !== "string" ||
    typeof envelope.server_time !== "string"
  ) {
    throw new HttpError(502, "INVALID_API_RESPONSE", "Identitas respons command tidak lengkap.");
  }
  return {
    command_id: envelope.command_id,
    result: record(envelope.result, "Hasil command"),
    server_time: envelope.server_time,
  };
}

export class HttpBackofficeCommandGateway implements BackofficeCommandGateway {
  constructor(
    private readonly client: AuthenticatedHttpClient,
    private readonly auth: AuthContextResponse,
  ) {}

  createPurchase(identity: CommandIdentityInput, payload: PurchaseCreatePayload) {
    return this.send("purchasing.purchase.create", identity, payload);
  }
  receivePurchase(identity: CommandIdentityInput, payload: PurchaseReceiptPayload) {
    return this.send("purchasing.receive_goods", identity, payload);
  }
  capturePurchaseInvoice(identity: CommandIdentityInput, payload: PurchaseInvoicePayload) {
    return this.send("purchasing.invoice.upsert", identity, payload);
  }
  postPurchase(identity: CommandIdentityInput, payload: PurchasePostPayload) {
    return this.send("purchasing.purchase.post", identity, payload);
  }
  createPriceProposal(identity: CommandIdentityInput, payload: PriceProposalCreatePayload) {
    return this.send("pricing.proposal.create", identity, payload);
  }
  submitPriceProposal(identity: CommandIdentityInput, payload: PriceProposalSubmitPayload) {
    return this.send("pricing.proposal.submit", identity, payload);
  }
  approvePriceProposal(identity: CommandIdentityInput, payload: PriceProposalApprovePayload) {
    return this.send("pricing.proposal.approve", identity, payload);
  }
  publishPromotion(identity: CommandIdentityInput, payload: PromotionPublishPayload) {
    return this.send("pricing.promotion.publish", identity, payload);
  }
  adjustInventory(identity: CommandIdentityInput, payload: InventoryAdjustmentPayload) {
    return this.send("inventory.adjust", identity, payload);
  }
  createOpname(identity: CommandIdentityInput, payload: OpnameCreatePayload) {
    return this.send("inventory.opname.create", identity, payload);
  }
  countOpname(identity: CommandIdentityInput, payload: OpnameCountPayload) {
    return this.send("inventory.opname.count", identity, payload);
  }
  recountOpname(identity: CommandIdentityInput, payload: OpnameCountPayload) {
    return this.send("inventory.opname.recount", identity, payload);
  }
  reviewOpname(identity: CommandIdentityInput, payload: OpnameTransitionPayload) {
    return this.send("inventory.opname.review", identity, payload);
  }
  postOpname(identity: CommandIdentityInput, payload: OpnameTransitionPayload) {
    return this.send("inventory.opname.post", identity, payload);
  }
  resolveRefund(identity: CommandIdentityInput, payload: RefundResolvePayload) {
    return this.send("returns.refund.resolve", identity, payload);
  }
  retryRefund(identity: CommandIdentityInput, payload: RefundRetryPayload) {
    return this.send("returns.refund.retry", identity, payload);
  }
  reverseRefund(identity: CommandIdentityInput, payload: RefundReversePayload) {
    return this.send("returns.refund.reverse", identity, payload);
  }

  private async send(
    commandType: string,
    identity: CommandIdentityInput,
    payload: unknown,
  ): Promise<OperationalCommandResult> {
    const response = await this.client.postUnwrapped<unknown>(
      "/api/v1/commands",
      {
        command: {
          authorization_version: this.auth.authorization_version,
          command_id: identity.commandId,
          command_type: commandType,
          correlation_id: identity.correlationId,
          device_id: identity.deviceId,
          location_id: this.auth.default_location_id,
          occurred_at: identity.occurredAt,
          payload,
          schema_version: 1,
        },
      },
      { "Idempotency-Key": identity.commandId },
    );
    return parseResult(response);
  }
}
