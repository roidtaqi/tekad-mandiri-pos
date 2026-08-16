import { SYSTEM_HEALTH_PATH } from "@kastur/contracts";
import { describe, expect, it } from "vitest";

import worker from "./index";

describe("system health endpoint", () => {
  it("returns a minimal non-sensitive response", async () => {
    const response = await worker.fetch(
      new Request(`https://api.kastur.test${SYSTEM_HEALTH_PATH}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("does not expose other routes", async () => {
    const response = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/unknown"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "NOT_FOUND" });
  });
});
