import { describe, expect, it } from "vitest";

import { AuthenticatedHttpClient, type FetchImplementation } from "./http";
import {
  HttpBackofficeResourceGateway,
  type BackofficeResource,
} from "./resource-gateway";

const resources = [
  "overview",
  "attention",
  "purchases",
  "inventory",
  "pricing",
  "sales",
  "returns",
  "reports",
  "users",
  "terminals",
] as const satisfies readonly BackofficeResource[];

describe("HttpBackofficeResourceGateway", () => {
  it("maps every approved read resource to its exact API endpoint", async () => {
    const paths: string[] = [];
    const fetchImplementation: FetchImplementation = async (input) => {
      paths.push(String(input));
      return Response.json({ data: { items: [] } });
    };
    const gateway = new HttpBackofficeResourceGateway(
      new AuthenticatedHttpClient({
        bearer: "resource-session-secret-1234567890abcdef",
        fetchImplementation,
      }),
    );

    for (const resource of resources) {
      await gateway.get(resource);
    }

    expect(paths).toEqual(
      resources.map((resource) => `/api/v1/backoffice/${resource}`),
    );
  });
});
