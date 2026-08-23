import { describe, expect, it, vi } from "vitest";

import {
  completeReturnOnline,
  getReturnableSaleOnline,
  searchReturnableSalesOnline,
  type CompleteReturnPayload,
} from "./return-api.js";

const payload: CompleteReturnPayload = {
  return_id: "00000000-0000-4000-8000-000000000001",
  return_number: "RET-260823-00000000",
  original_transaction_id: "00000000-0000-4000-8000-000000000002",
  return_type: "PARTIAL",
  receipt_mode: "TRANSACTION_LINKED",
  shift_id: "00000000-0000-4000-8000-000000000003",
  terminal_id: "00000000-0000-4000-8000-000000000004",
  occurred_at: "2026-08-23T00:00:00.000Z",
  notes: null,
  items: [{
    return_item_id: "00000000-0000-4000-8000-000000000005",
    original_transaction_item_id: "00000000-0000-4000-8000-000000000006",
    product_id: "00000000-0000-4000-8000-000000000007",
    product_unit_id: "00000000-0000-4000-8000-000000000008",
    conversion_snapshot: "1",
    return_qty: "1",
    reason_code: "DAMAGED",
    disposition: "NOT_RESTOCKED",
    condition_notes: null,
  }],
  refund: {
    refund_id: "00000000-0000-4000-8000-000000000009",
    refund_number: "RFD-260823-00000000",
    original_payment_id: "00000000-0000-4000-8000-000000000010",
    payment_method_id: "00000000-0000-4000-8000-000000000011",
    amount: "12500",
    override_method: false,
    override_amount: false,
    override_reason: null,
    external_reference: null,
  },
};

const commandId = "00000000-0000-4000-8000-000000000012";

describe("completeReturnOnline", () => {
  it("sends an idempotent online-authoritative command and decodes warnings", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        command_id: commandId,
        result: {
          return_id: payload.return_id,
          return_status: "COMPLETED",
          refund_id: payload.refund.refund_id,
          refund_status: "PENDING",
          warnings: ["REFUND_PROVIDER_PENDING"],
          replayed: false,
        },
        server_time: "2026-08-23T00:00:01.000Z",
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const result = await completeReturnOnline({
      apiBaseUrl: "https://api.example.test",
      bearer: "session-bearer",
      deviceId: "00000000-0000-4000-8000-000000000013",
      terminalId: "00000000-0000-4000-8000-000000000016",
      locationId: "00000000-0000-4000-8000-000000000014",
      authorizationVersion: 7,
      commandId,
      correlationId: "00000000-0000-4000-8000-000000000015",
      payload,
      fetchImplementation,
    });

    expect(result).toMatchObject({
      command_id: commandId,
      refund_status: "PENDING",
      warnings: ["REFUND_PROVIDER_PENDING"],
    });
    const [requestUrl, requestInit] = fetchImplementation.mock.calls[0]!;
    expect(String(requestUrl)).toBe("https://api.example.test/api/v1/commands");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer session-bearer",
      "Idempotency-Key": commandId,
    });
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      command: {
        command_id: commandId,
        command_type: "returns.complete",
        authorization_version: 7,
        payload,
      },
    });
  });

  it("preserves a stable server error code for the UI", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        error: { code: "RETURN_QUANTITY_EXCEEDED", message: "Jumlah retur melebihi sisa." },
      }), { status: 409, headers: { "content-type": "application/json" } }),
    );

    await expect(completeReturnOnline({
      apiBaseUrl: "https://api.example.test",
      bearer: "session-bearer",
      deviceId: "00000000-0000-4000-8000-000000000013",
      terminalId: "00000000-0000-4000-8000-000000000016",
      locationId: "00000000-0000-4000-8000-000000000014",
      authorizationVersion: 7,
      commandId,
      correlationId: "00000000-0000-4000-8000-000000000015",
      payload,
      fetchImplementation,
    })).rejects.toMatchObject({
      name: "ReturnApiError",
      status: 409,
      code: "RETURN_QUANTITY_EXCEEDED",
    });
  });

  it("rejects a response for another command id", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        command_id: "00000000-0000-4000-8000-000000000099",
        result: {
          return_id: payload.return_id,
          return_status: "COMPLETED",
          refund_id: payload.refund.refund_id,
          refund_status: "COMPLETED",
          warnings: [],
          replayed: false,
        },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(completeReturnOnline({
      apiBaseUrl: "https://api.example.test",
      bearer: "session-bearer",
      deviceId: "00000000-0000-4000-8000-000000000013",
      terminalId: "00000000-0000-4000-8000-000000000016",
      locationId: "00000000-0000-4000-8000-000000000014",
      authorizationVersion: 7,
      commandId,
      correlationId: "00000000-0000-4000-8000-000000000015",
      payload,
      fetchImplementation,
    })).rejects.toThrow("command_id berbeda");
  });
});

const returnableSale = {
  transaction: {
    change_amount: "0.0000",
    completed_at: "2026-08-22T23:00:01.000Z",
    grand_total: "12500.0000",
    line_discount_total: "0.0000",
    location_id: "00000000-0000-4000-8000-000000000014",
    occurred_at: "2026-08-22T23:00:00.000Z",
    promotion_discount_total: "0.0000",
    status: "COMPLETED",
    subtotal: "12500.0000",
    tax_total: "0.0000",
    terminal_id: "00000000-0000-4000-8000-000000000099",
    transaction_discount_total: "0.0000",
    transaction_id: payload.original_transaction_id,
    transaction_number: "POS-LAIN-0001",
  },
  items: [{
    conversion_snapshot: "1.00000000",
    final_unit_price_snapshot: "12500.0000",
    line_total: "12500.0000",
    product_id: payload.items[0]!.product_id,
    product_name_snapshot: "Produk Historis",
    product_unit_id: payload.items[0]!.product_unit_id,
    quantity: "1.000000",
    remaining_returnable_qty: "1.000000",
    sku_snapshot: "SKU-HIST",
    transaction_item_id: payload.items[0]!.original_transaction_item_id,
    unit_code_snapshot: "PCS",
    unit_name_snapshot: "Pcs",
  }],
  payments: [{
    amount: "12500.0000",
    amount_tendered: null,
    change_amount: null,
    external_reference: "PROVIDER-REF",
    method_code: "QRIS",
    payment_id: payload.refund.original_payment_id,
    payment_method_id: payload.refund.payment_method_id,
    status: "COMPLETED",
  }],
};

describe("Return Sale lookup", () => {
  it("loads an authenticated cross-terminal Sale without exposing cost fields", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [returnableSale] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await searchReturnableSalesOnline({
      apiBaseUrl: "https://api.example.test",
      bearer: "session-bearer",
      deviceId: "00000000-0000-4000-8000-000000000013",
      terminalId: "00000000-0000-4000-8000-000000000004",
      query: "POS-LAIN-0001",
      fetchImplementation,
    });

    expect(result).toEqual([returnableSale]);
    expect(JSON.stringify(result)).not.toContain("cost");
    const [requestUrl, requestInit] = fetchImplementation.mock.calls[0]!;
    expect(String(requestUrl)).toContain("/api/v1/returns/sales?q=POS-LAIN-0001");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer session-bearer",
      "X-Kastur-Client": "pos",
      "X-Kastur-Device-Id": "00000000-0000-4000-8000-000000000013",
      "X-Terminal-Id": "00000000-0000-4000-8000-000000000004",
    });
  });

  it("loads one authoritative Sale detail and preserves remaining quantity strings", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: returnableSale }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await getReturnableSaleOnline({
      apiBaseUrl: "https://api.example.test",
      bearer: "session-bearer",
      deviceId: "00000000-0000-4000-8000-000000000013",
      terminalId: "00000000-0000-4000-8000-000000000004",
      transactionId: payload.original_transaction_id,
      fetchImplementation,
    });

    expect(result.items[0]?.remaining_returnable_qty).toBe("1.000000");
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      `https://api.example.test/api/v1/returns/sales/${payload.original_transaction_id}`,
    );
  });

  it("preserves a stable lookup error code", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        error: { code: "RETURN_TRANSACTION_NOT_FOUND", message: "Transaksi tidak ditemukan." },
      }), { status: 404, headers: { "content-type": "application/json" } }),
    );

    await expect(getReturnableSaleOnline({
      apiBaseUrl: "https://api.example.test",
      bearer: "session-bearer",
      deviceId: "00000000-0000-4000-8000-000000000013",
      terminalId: "00000000-0000-4000-8000-000000000004",
      transactionId: payload.original_transaction_id,
      fetchImplementation,
    })).rejects.toMatchObject({ code: "RETURN_TRANSACTION_NOT_FOUND", status: 404 });
  });
});
