import { describe, expect, it } from "vitest";
import { hasCachedPermission } from "../src/index.js";
import type { AuthContextResponse } from "@kastur/contracts";

describe("hasCachedPermission", () => {
  const baseContext: AuthContextResponse = {
    user: { id: "u1", display_name: "Test" },
    membership: { business_id: "b1", status: "ACTIVE" },
    primary_role: "OWNER",
    permissions: [],
    authorization_version: 1,
    offline_valid_until: "2026-08-16T00:00:00Z",
    default_location_id: "l1",
    server_time: "2026-08-16T00:00:00Z",
  };

  it("A. explicit permission present -> true", () => {
    const ctx = { ...baseContext, permissions: ["product.read", "product.create"] };
    expect(hasCachedPermission(ctx, "product.read")).toBe(true);
    expect(hasCachedPermission(ctx, "product.create")).toBe(true);
  });

  it("B. explicit permission absent -> false", () => {
    const ctx = { ...baseContext, permissions: ["product.read"] };
    expect(hasCachedPermission(ctx, "product.create")).toBe(false);
  });

  it("C. OWNER primary_role with absent permission -> false", () => {
    const ctx = { ...baseContext, primary_role: "OWNER", permissions: [] };
    expect(hasCachedPermission(ctx, "product.read")).toBe(false);
  });

  it("D. duplicate permission entries do not alter semantics", () => {
    const ctx = { ...baseContext, permissions: ["product.read", "product.read"] };
    expect(hasCachedPermission(ctx, "product.read")).toBe(true);
  });

  it("E. empty permission list denies", () => {
    const ctx = { ...baseContext, permissions: [] };
    expect(hasCachedPermission(ctx, "product.read")).toBe(false);
  });
});
