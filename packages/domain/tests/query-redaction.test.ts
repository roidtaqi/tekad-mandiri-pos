import { describe, expect, it } from "vitest";
import { selectPermissionBoundFields } from "../src/core/query-redaction";

describe("Permission-Aware Query Redaction", () => {
  it("A. protected field absent when permission missing", () => {
    const permissions = new Set(["some.other.permission"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "cost", required_permissions: ["cost.read"], value: 100 }
    ]);
    expect("cost" in result).toBe(false);
  });

  it("B. protected field present when permission exists", () => {
    const permissions = new Set(["cost.read"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "cost", required_permissions: ["cost.read"], value: 100 }
    ]);
    expect("cost" in result).toBe(true);
    expect(result.cost).toBe(100);
  });

  it("C. ALL-OF requirement missing first permission -> absent", () => {
    const permissions = new Set(["pricing.read"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "margin", required_permissions: ["cost.read", "pricing.read"], value: 50 }
    ]);
    expect("margin" in result).toBe(false);
  });

  it("D. ALL-OF requirement missing second permission -> absent", () => {
    const permissions = new Set(["cost.read"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "margin", required_permissions: ["cost.read", "pricing.read"], value: 50 }
    ]);
    expect("margin" in result).toBe(false);
  });

  it("E. ALL-OF requirement complete -> present", () => {
    const permissions = new Set(["cost.read", "pricing.read"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "margin", required_permissions: ["cost.read", "pricing.read"], value: 50 }
    ]);
    expect("margin" in result).toBe(true);
    expect(result.margin).toBe(50);
  });

  it("F. role label OWNER without permission -> absent", () => {
    // Role is cosmetic at this layer; only the permission set matters.
    const ownerLabeledActor = {
      business_id: "test-biz",
      user_id: "test-user",
      primary_role: "OWNER",
      permissions: new Set(["workspace.pos.access"])
    };
    const result = selectPermissionBoundFields(ownerLabeledActor.permissions, [
      { key: "audit", required_permissions: ["audit.sensitive.read"], value: "secret" }
    ]);
    expect("audit" in result).toBe(false);
  });

  it("G, H, I, J. authorized falsy values are exactly preserved", () => {
    const permissions = new Set(["read"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "zero", required_permissions: ["read"], value: 0 },
      { key: "falseVal", required_permissions: ["read"], value: false },
      { key: "emptyStr", required_permissions: ["read"], value: "" },
      { key: "nullVal", required_permissions: ["read"], value: null },
    ]);
    expect(result.zero).toBe(0);
    expect(result.falseVal).toBe(false);
    expect(result.emptyStr).toBe("");
    expect(result.nullVal).toBe(null);
  });

  it("K. denied field key is truly absent, not undefined", () => {
    const permissions = new Set(["other"]);
    const result = selectPermissionBoundFields(permissions, [
      { key: "cost", required_permissions: ["cost.read"], value: 100 }
    ]);
    expect(Object.hasOwn(result, "cost")).toBe(false);
    expect(Object.keys(result)).toEqual([]);
  });

  it("L. input/source object is not mutated", () => {
    const source = { cost: 100, price: 200 };
    const sourceCopy = { ...source };
    const permissions = new Set<string>();

    const result = selectPermissionBoundFields(permissions, [
      { key: "cost", required_permissions: ["cost.read"], value: source.cost }
    ]);

    expect(result).toEqual({});
    expect(source).toEqual(sourceCopy); // Immutable original source
  });

  it("M. unknown source property is never automatically copied", () => {
    const source = { cost: 100, secret: "sssh" };
    const permissions = new Set(["cost.read"]);
    
    const result = selectPermissionBoundFields(permissions, [
      { key: "cost", required_permissions: ["cost.read"], value: source.cost }
    ]);
    // 'secret' is intentionally omitted from descriptors, so it cannot be copied.
    expect("secret" in result).toBe(false);
  });

  it("N. empty protected permission requirement rejected", () => {
    const permissions = new Set(["read"]);
    expect(() => {
      selectPermissionBoundFields(permissions, [
        { key: "cost", required_permissions: [], value: 100 }
      ]);
    }).toThrow('Protected field descriptor for key "cost" must require at least one permission.');
  });

  it("O. duplicate protected output key rejected", () => {
    const permissions = new Set(["cost.read"]);
    expect(() => {
      selectPermissionBoundFields(permissions, [
        { key: "cost", required_permissions: ["cost.read"], value: 100 },
        { key: "cost", required_permissions: ["cost.read"], value: 200 }
      ]);
    }).toThrow('Duplicate protected field descriptor for key "cost".');
  });
});
