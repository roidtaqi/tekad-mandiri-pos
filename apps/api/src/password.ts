export interface HashedPasswordResult {
  readonly algorithm: "PBKDF2_SHA256";
  readonly hash: string;
  readonly iterations: number;
  readonly salt: string;
}

export function generateSaltHex(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(
  password: string,
  options?: {
    readonly iterations?: number;
    readonly salt?: string;
  },
): Promise<HashedPasswordResult> {
  const iterations = options?.iterations ?? 100_000;
  const salt = options?.salt ?? generateSaltHex(16);
  const saltBuffer = hexToBytes(salt);
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: saltBuffer,
    },
    keyMaterial,
    256,
  );

  const hash = bytesToHex(new Uint8Array(derivedBits));

  return {
    algorithm: "PBKDF2_SHA256",
    hash,
    iterations,
    salt,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  saltHex: string,
  iterations = 100_000,
): Promise<boolean> {
  if (!password || !expectedHash || !saltHex) {
    return false;
  }

  const { hash } = await hashPassword(password, { iterations, salt: saltHex });
  return constantTimeEqual(hash, expectedHash);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

