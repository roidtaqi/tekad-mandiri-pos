import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  generateSaltHex,
  hashPassword,
  verifyPassword,
} from "./password.js";

describe("Password Hashing & Verification (password.ts)", () => {
  it("generates random hex salts of specified length", () => {
    const salt1 = generateSaltHex(16);
    const salt2 = generateSaltHex(16);

    expect(salt1).toHaveLength(32);
    expect(salt2).toHaveLength(32);
    expect(salt1).not.toBe(salt2);
  });

  it("hashes password and verifies successfully with correct password", async () => {
    const password = "SuperSecretPassword123!";
    const hashed = await hashPassword(password);

    expect(hashed.algorithm).toBe("PBKDF2_SHA256");
    expect(hashed.iterations).toBe(100_000);
    expect(hashed.salt).toHaveLength(32);
    expect(hashed.hash).toHaveLength(64);

    const isValid = await verifyPassword(
      password,
      hashed.hash,
      hashed.salt,
      hashed.iterations,
    );
    expect(isValid).toBe(true);
  });

  it("rejects verification when password is wrong", async () => {
    const password = "CorrectPassword123!";
    const hashed = await hashPassword(password);

    const isValid = await verifyPassword(
      "WrongPassword123!",
      hashed.hash,
      hashed.salt,
      hashed.iterations,
    );
    expect(isValid).toBe(false);
  });

  it("performs constant-time string comparison", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

