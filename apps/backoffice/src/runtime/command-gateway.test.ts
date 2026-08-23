import type { AuthContextResponse } from "@kastur/contracts";
import { describe, expect, it, vi } from "vitest";

import { HttpBackofficeCommandGateway } from "./command-gateway";
import { AuthenticatedHttpClient, HttpError, type FetchImplementation } from "./http";

const bearer = "backoffice-command-session-secret-1234567890";
const identity = {
  commandId: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222",
  deviceId: "33333333-3333-4333-8333-333333333333",
  occurredAt: "2026-08-23T08:00:00.000Z",
} as const;
const auth: AuthContextResponse = {
  authorization_version: 9,
  default_location_id: "44444444-4444-4444-8444-444444444444",
  membership: { business_id: "55555555-5555-4555-8555-555555555555", status: "ACTIVE" },
  offline_valid_until: "2026-08-24T00:00:00.000Z",
  permissions: ["workspace.backoffice.access"],
  primary_role: "OWNER",
  server_time: "2026-08-23T07:59:59.000Z",
  user: { display_name: "Owner", id: "66666666-6666-4666-8666-666666666666" },
};

function commandHarness() {
  const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetchImplementation: FetchImplementation = vi.fn(async (input, init) => {
    requests.push({ input, ...(init === undefined ? {} : { init }) });
    return Response.json({ command_id: identity.commandId, result: { replayed: false, version: "1" }, server_time: "2026-08-23T08:00:01.000Z" });
  });
  return {
    gateway: new HttpBackofficeCommandGateway(new AuthenticatedHttpClient({ bearer, fetchImplementation }), auth),
    requests,
  };
}

function bodyOf(request: { readonly init?: RequestInit }) {
  return JSON.parse(String(request.init?.body)) as Record<string, unknown>;
}

describe("HttpBackofficeCommandGateway", () => {
  it("sends a typed purchasing command envelope with the command ID as idempotency key", async () => {
    const { gateway, requests } = commandHarness();
    const payload = {
      purchase_id: "77777777-7777-4777-8777-777777777777",
      expected_version: 3,
      accepted_integrity_exception_ids: ["88888888-8888-4888-8888-888888888888"],
      notes: "Diverifikasi Owner",
    } as const;

    await gateway.postPurchase(identity, payload);

    expect(String(requests[0]?.input)).toBe("/api/v1/commands");
    expect(requests[0]?.init?.method).toBe("POST");
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${bearer}`);
    expect(headers.get("idempotency-key")).toBe(identity.commandId);
    expect(bodyOf(requests[0]!)).toEqual({
      command: {
        authorization_version: 9,
        command_id: identity.commandId,
        command_type: "purchasing.purchase.post",
        correlation_id: identity.correlationId,
        device_id: identity.deviceId,
        location_id: auth.default_location_id,
        occurred_at: identity.occurredAt,
        payload,
        schema_version: 1,
      },
    });
  });

  it("maps pricing, inventory, and refund methods to their approved business command types", async () => {
    const { gateway, requests } = commandHarness();
    await gateway.publishPromotion(identity, {
      promotion_id: "77777777-7777-4777-8777-777777777777", product_unit_id: "88888888-8888-4888-8888-888888888888", name: "Promo", promotion_type: "FIXED_PRICE", value: "10000.0000", min_qty: "1.0000", priority: 1, effective_from: "2026-08-24T00:00:00.000Z", effective_to: "2026-08-25T00:00:00.000Z", owner_reason: null,
    });
    await gateway.adjustInventory(identity, {
      adjustment_id: "77777777-7777-4777-8777-777777777777", adjustment_number: "ADJ-1", direction: "OUT", reason_code: "DAMAGED", notes: null,
      items: [{ item_id: "88888888-8888-4888-8888-888888888888", product_id: "99999999-9999-4999-8999-999999999999", product_unit_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: "2.0000", conversion_snapshot: "1.0000" }],
    });
    await gateway.resolveRefund(identity, {
      refund_id: "77777777-7777-4777-8777-777777777777", expected_version: 2, resolution_status: "COMPLETED", external_reference: "BANK-01", reason: "Settlement terkonfirmasi",
    });
    await gateway.retryRefund(identity, {
      refund_id: "77777777-7777-4777-8777-777777777777", expected_version: 3, reason: "Ulangi settlement",
    });
    await gateway.reverseRefund(identity, {
      refund_id: "77777777-7777-4777-8777-777777777777", expected_version: 4, reason: "Koreksi refund",
    });

    expect(requests.map((request) => ((bodyOf(request).command as Record<string, unknown>).command_type))).toEqual([
      "pricing.promotion.publish",
      "inventory.adjust",
      "returns.refund.resolve",
      "returns.refund.retry",
      "returns.refund.reverse",
    ]);
    expect(((bodyOf(requests[2]!).command as Record<string, unknown>).payload)).toEqual({
      refund_id: "77777777-7777-4777-8777-777777777777",
      expected_version: 2,
      resolution_status: "COMPLETED",
      external_reference: "BANK-01",
      reason: "Settlement terkonfirmasi",
    });
  });

  it("rejects a malformed successful command response", async () => {
    const fetchImplementation: FetchImplementation = async () => Response.json({ data: {} });
    const gateway = new HttpBackofficeCommandGateway(new AuthenticatedHttpClient({ bearer, fetchImplementation }), auth);
    await expect(gateway.submitPriceProposal(identity, { price_set_id: "77777777-7777-4777-8777-777777777777", expected_version: 1 })).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      status: 502,
    } satisfies Partial<HttpError>);
  });
});
