export type ReturnDisposition = "RESTOCK" | "NOT_RESTOCKED";

export interface CompleteReturnPayload {
  readonly return_id: string;
  readonly return_number: string;
  readonly original_transaction_id: string;
  readonly return_type: "PARTIAL" | "FULL";
  readonly receipt_mode: "TRANSACTION_LINKED";
  readonly shift_id: string;
  readonly terminal_id: string;
  readonly occurred_at: string;
  readonly notes: string | null;
  readonly items: readonly {
    readonly return_item_id: string;
    readonly original_transaction_item_id: string;
    readonly product_id: string;
    readonly product_unit_id: string;
    readonly conversion_snapshot: string;
    readonly return_qty: string;
    readonly reason_code: string;
    readonly disposition: ReturnDisposition;
    readonly condition_notes: string | null;
  }[];
  readonly refund: {
    readonly refund_id: string;
    readonly refund_number: string;
    readonly original_payment_id: string;
    readonly payment_method_id: string;
    readonly amount: string;
    readonly override_method: false;
    readonly override_amount: false;
    readonly override_reason: null;
    readonly external_reference: null;
  };
}

export interface CompleteReturnOnlineInput {
  readonly apiBaseUrl: string;
  readonly bearer: string;
  readonly deviceId: string;
  readonly terminalId: string;
  readonly locationId: string;
  readonly authorizationVersion: number;
  readonly commandId: string;
  readonly correlationId: string;
  readonly payload: CompleteReturnPayload;
  readonly fetchImplementation?: typeof fetch;
}

export interface CompleteReturnOnlineResult {
  readonly command_id: string;
  readonly replayed: boolean;
  readonly return_id: string;
  readonly return_status: "COMPLETED";
  readonly refund_id: string;
  readonly refund_status: "COMPLETED" | "PENDING";
  readonly warnings: readonly string[];
}

export interface ReturnableSaleDetail {
  readonly transaction: {
    readonly change_amount: string;
    readonly completed_at: string | null;
    readonly grand_total: string;
    readonly line_discount_total: string;
    readonly location_id: string;
    readonly occurred_at: string;
    readonly promotion_discount_total: string;
    readonly status: "COMPLETED";
    readonly subtotal: string;
    readonly tax_total: string;
    readonly terminal_id: string;
    readonly transaction_discount_total: string;
    readonly transaction_id: string;
    readonly transaction_number: string;
  };
  readonly items: readonly {
    readonly conversion_snapshot: string;
    readonly final_unit_price_snapshot: string;
    readonly line_total: string;
    readonly product_id: string;
    readonly product_name_snapshot: string;
    readonly product_unit_id: string;
    readonly quantity: string;
    readonly remaining_returnable_qty: string;
    readonly sku_snapshot: string;
    readonly transaction_item_id: string;
    readonly unit_code_snapshot: string;
    readonly unit_name_snapshot: string;
  }[];
  readonly payments: readonly {
    readonly amount: string;
    readonly amount_tendered: string | null;
    readonly change_amount: string | null;
    readonly external_reference: string | null;
    readonly method_code: string;
    readonly payment_id: string;
    readonly payment_method_id: string;
    readonly status: string;
  }[];
}

interface ReturnSaleApiInput {
  readonly apiBaseUrl: string;
  readonly bearer: string;
  readonly deviceId: string;
  readonly terminalId: string;
  readonly fetchImplementation?: typeof fetch;
}

export interface SearchReturnableSalesInput extends ReturnSaleApiInput {
  readonly limit?: number;
  readonly query: string;
}

export interface GetReturnableSaleInput extends ReturnSaleApiInput {
  readonly transactionId: string;
}

export class ReturnApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ReturnApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") throw new Error(`Respons Return tidak memiliki ${key}.`);
  return field;
}

function nullableStringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field !== null && typeof field !== "string") {
    throw new Error(`Respons Return memiliki ${key} yang tidak valid.`);
  }
  return field;
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  if (!isRecord(field)) throw new Error(`Respons Return tidak memiliki ${key}.`);
  return field;
}

function recordArrayField(
  value: Record<string, unknown>,
  key: string,
): readonly Record<string, unknown>[] {
  const field = value[key];
  if (!Array.isArray(field) || !field.every(isRecord)) {
    throw new Error(`Respons Return tidak memiliki ${key} yang valid.`);
  }
  return field;
}

function decodeReturnableSale(value: unknown): ReturnableSaleDetail {
  if (!isRecord(value)) throw new Error("Detail transaksi Return tidak valid.");
  const transaction = recordField(value, "transaction");
  const status = stringField(transaction, "status");
  if (status !== "COMPLETED") throw new Error("Transaksi Return bukan COMPLETED.");
  return {
    transaction: {
      change_amount: stringField(transaction, "change_amount"),
      completed_at: nullableStringField(transaction, "completed_at"),
      grand_total: stringField(transaction, "grand_total"),
      line_discount_total: stringField(transaction, "line_discount_total"),
      location_id: stringField(transaction, "location_id"),
      occurred_at: stringField(transaction, "occurred_at"),
      promotion_discount_total: stringField(transaction, "promotion_discount_total"),
      status,
      subtotal: stringField(transaction, "subtotal"),
      tax_total: stringField(transaction, "tax_total"),
      terminal_id: stringField(transaction, "terminal_id"),
      transaction_discount_total: stringField(transaction, "transaction_discount_total"),
      transaction_id: stringField(transaction, "transaction_id"),
      transaction_number: stringField(transaction, "transaction_number"),
    },
    items: recordArrayField(value, "items").map((item) => ({
      conversion_snapshot: stringField(item, "conversion_snapshot"),
      final_unit_price_snapshot: stringField(item, "final_unit_price_snapshot"),
      line_total: stringField(item, "line_total"),
      product_id: stringField(item, "product_id"),
      product_name_snapshot: stringField(item, "product_name_snapshot"),
      product_unit_id: stringField(item, "product_unit_id"),
      quantity: stringField(item, "quantity"),
      remaining_returnable_qty: stringField(item, "remaining_returnable_qty"),
      sku_snapshot: stringField(item, "sku_snapshot"),
      transaction_item_id: stringField(item, "transaction_item_id"),
      unit_code_snapshot: stringField(item, "unit_code_snapshot"),
      unit_name_snapshot: stringField(item, "unit_name_snapshot"),
    })),
    payments: recordArrayField(value, "payments").map((payment) => ({
      amount: stringField(payment, "amount"),
      amount_tendered: nullableStringField(payment, "amount_tendered"),
      change_amount: nullableStringField(payment, "change_amount"),
      external_reference: nullableStringField(payment, "external_reference"),
      method_code: stringField(payment, "method_code"),
      payment_id: stringField(payment, "payment_id"),
      payment_method_id: stringField(payment, "payment_method_id"),
      status: stringField(payment, "status"),
    })),
  };
}

async function readReturnApiResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new ReturnApiError(
      error !== null && typeof error.message === "string"
        ? error.message
        : "Data transaksi Return belum dapat dimuat.",
      response.status,
      error !== null && typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
    );
  }
  return body;
}

function returnSaleHeaders(input: ReturnSaleApiInput): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${input.bearer}`,
    "X-Kastur-Client": "pos",
    "X-Kastur-Device-Id": input.deviceId,
    "X-Terminal-Id": input.terminalId,
  };
}

export async function searchReturnableSalesOnline(
  input: SearchReturnableSalesInput,
): Promise<readonly ReturnableSaleDetail[]> {
  const url = new URL("/api/v1/returns/sales", input.apiBaseUrl);
  url.searchParams.set("q", input.query.trim());
  url.searchParams.set("limit", String(input.limit ?? 20));
  const response = await (input.fetchImplementation ?? fetch)(url, {
    headers: returnSaleHeaders(input),
    method: "GET",
  });
  const body = await readReturnApiResponse(response);
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error("Respons pencarian transaksi Return tidak valid.");
  }
  return body.data.map(decodeReturnableSale);
}

export async function getReturnableSaleOnline(
  input: GetReturnableSaleInput,
): Promise<ReturnableSaleDetail> {
  const url = new URL(
    `/api/v1/returns/sales/${encodeURIComponent(input.transactionId)}`,
    input.apiBaseUrl,
  );
  const response = await (input.fetchImplementation ?? fetch)(url, {
    headers: returnSaleHeaders(input),
    method: "GET",
  });
  const body = await readReturnApiResponse(response);
  if (!isRecord(body)) throw new Error("Respons detail transaksi Return tidak valid.");
  return decodeReturnableSale(body.data);
}

function decodeResult(value: unknown, commandId: string): CompleteReturnOnlineResult {
  if (!isRecord(value) || !isRecord(value.result)) {
    throw new Error("Respons command Return tidak valid.");
  }
  if (stringField(value, "command_id") !== commandId) {
    throw new Error("Respons Return memiliki command_id berbeda.");
  }
  const result = value.result;
  const returnStatus = stringField(result, "return_status");
  const refundStatus = stringField(result, "refund_status");
  if (returnStatus !== "COMPLETED" || (refundStatus !== "COMPLETED" && refundStatus !== "PENDING")) {
    throw new Error("Status hasil Return tidak dikenal.");
  }
  const warnings = result.warnings;
  if (!Array.isArray(warnings) || !warnings.every((warning) => typeof warning === "string")) {
    throw new Error("Peringatan hasil Return tidak valid.");
  }
  return {
    command_id: commandId,
    replayed: result.replayed === true,
    return_id: stringField(result, "return_id"),
    return_status: returnStatus,
    refund_id: stringField(result, "refund_id"),
    refund_status: refundStatus,
    warnings,
  };
}

export async function completeReturnOnline(
  input: CompleteReturnOnlineInput,
): Promise<CompleteReturnOnlineResult> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const response = await fetchImplementation(new URL("/api/v1/commands", input.apiBaseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.bearer}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.commandId,
      "X-Kastur-Client": "pos",
      "X-Kastur-Device-Id": input.deviceId,
      "X-Terminal-Id": input.terminalId,
    },
    body: JSON.stringify({
      command: {
        schema_version: 1,
        command_id: input.commandId,
        command_type: "returns.complete",
        occurred_at: input.payload.occurred_at,
        location_id: input.locationId,
        device_id: input.deviceId,
        authorization_version: input.authorizationVersion,
        correlation_id: input.correlationId,
        payload: input.payload,
      },
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new ReturnApiError(
      error !== null && typeof error.message === "string"
        ? error.message
        : "Return belum dapat diproses.",
      response.status,
      error !== null && typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
    );
  }
  return decodeResult(body, input.commandId);
}
