import { describe, it, expect } from "vitest";
import { deriveQuickLockHash, generateQuickLockSalt } from "../src/quick-lock.js";

describe("Quick Lock", () => {
  it("should generate a 32-character hex salt", () => {
    const salt = generateQuickLockSalt();
    expect(salt).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(salt)).toBe(true);
  });

  it("should derive deterministic hash for the same PIN and salt", async () => {
    const pin = "123456";
    const salt = generateQuickLockSalt();

    const hash1 = await deriveQuickLockHash(pin, salt);
    const hash2 = await deriveQuickLockHash(pin, salt);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("should derive different hashes for different PINs", async () => {
    const salt = generateQuickLockSalt();

    const hash1 = await deriveQuickLockHash("123456", salt);
    const hash2 = await deriveQuickLockHash("654321", salt);

    expect(hash1).not.toBe(hash2);
  });

  it("should derive different hashes for same PIN but different salts", async () => {
    const pin = "123456";
    const salt1 = generateQuickLockSalt();
    const salt2 = generateQuickLockSalt();

    const hash1 = await deriveQuickLockHash(pin, salt1);
    const hash2 = await deriveQuickLockHash(pin, salt2);

    expect(hash1).not.toBe(hash2);
  });
});
