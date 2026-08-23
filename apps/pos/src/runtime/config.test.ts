import { describe, expect, it } from "vitest";

import { readPosRuntimeConfig } from "./config.js";

describe("POS runtime config", () => {
  it("accepts a public API base URL without credentials", () => {
    expect(readPosRuntimeConfig({ VITE_API_BASE_URL: "https://api.example.test" })).toEqual({
      apiBaseUrl: "https://api.example.test",
      clientVersion: "0.0.0",
      offlineAuthorizationVerification: null,
    });
  });

  it("requires the public verification key and key identifier together", () => {
    expect(() =>
      readPosRuntimeConfig({ VITE_OFFLINE_AUTH_KEY_ID: "offline-2026-01" }),
    ).toThrow("must be configured together");
  });
});
