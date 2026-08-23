import { describe, expect, it } from "vitest";
import { CatalogError } from "@kastur/contracts";

import {
  AuthenticatedHttpClient,
  type FetchImplementation,
} from "../../runtime/http";
import { HttpCatalogGateway } from "./HttpCatalogGateway";

const bearer = "catalog-session-secret-1234567890abcdef";

describe("HttpCatalogGateway", () => {
  it("serializes filters without changing a leading-zero barcode and sends bearer auth", async () => {
    let capturedInput: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: FetchImplementation = async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return Response.json({ data: { items: [], total: 0 } });
    };
    const gateway = new HttpCatalogGateway(
      new AuthenticatedHttpClient({ bearer, fetchImplementation }),
    );

    await gateway.listProducts({
      q: "089686012345",
      sort: "name_asc",
      track_inventory: false,
    });

    expect(String(capturedInput)).toContain("q=089686012345");
    expect(String(capturedInput)).toContain("track_inventory=false");
    expect(new Headers(capturedInit?.headers).get("authorization")).toBe(`Bearer ${bearer}`);
  });

  it("posts product commands with independent idempotency and correlation IDs", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: FetchImplementation = async (_input, init) => {
      capturedInit = init;
      return Response.json(
        { data: { product_id: "product-1", version: "1" } },
        { status: 201 },
      );
    };
    const gateway = new HttpCatalogGateway(
      new AuthenticatedHttpClient({ bearer, fetchImplementation }),
    );

    await gateway.createProduct({
      base_unit_code: "PCS",
      brand_id: null,
      category_id: "11111111-1111-4111-8111-111111111111",
      name: "Kopi",
      product_id: "22222222-2222-4222-8222-222222222222",
      sku: "KOPI-01",
      track_inventory: true,
    });

    const headers = new Headers(capturedInit?.headers);
    expect(capturedInit?.method).toBe("POST");
    expect(headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(headers.get("idempotency-key")).not.toBe(headers.get("x-correlation-id"));
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({ sku: "KOPI-01" });
  });

  it("maps stable API catalog errors, including field attribution", async () => {
    const fetchImplementation: FetchImplementation = async () =>
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            details: { field: "sku" },
            message: "SKU wajib diisi.",
          },
        },
        { status: 400 },
      );
    const gateway = new HttpCatalogGateway(
      new AuthenticatedHttpClient({ bearer, fetchImplementation }),
    );

    await expect(gateway.createProduct({} as never)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      field: "sku",
      message: "SKU wajib diisi.",
      name: "CatalogError",
    } satisfies Partial<CatalogError>);
  });
});
