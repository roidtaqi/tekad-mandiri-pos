export const BACKOFFICE_SESSION_KEY = "kastur.backoffice.session_bearer.v1";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export class SessionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionInputError";
  }
}

export function normalizeSessionBearer(value: string): string {
  const trimmed = value.trim();
  const bearer = trimmed.toLowerCase().startsWith("bearer ")
    ? trimmed.slice(7).trim()
    : trimmed;

  if (bearer.length < 32 || !/^[A-Za-z0-9._~-]+$/u.test(bearer)) {
    throw new SessionInputError("Kode sesi tidak valid. Tempel kode sesi pengguna yang lengkap.");
  }

  return bearer;
}

export function readSessionBearer(storage: SessionStorageLike): string | null {
  try {
    const stored = storage.getItem(BACKOFFICE_SESSION_KEY);
    if (stored === null) {
      return null;
    }
    return normalizeSessionBearer(stored);
  } catch {
    try {
      storage.removeItem(BACKOFFICE_SESSION_KEY);
    } catch {
      // A denied storage API is treated as an absent session.
    }
    return null;
  }
}

export function writeSessionBearer(
  storage: SessionStorageLike,
  bearer: string,
): void {
  storage.setItem(BACKOFFICE_SESSION_KEY, normalizeSessionBearer(bearer));
}

export function clearSessionBearer(storage: SessionStorageLike): void {
  try {
    storage.removeItem(BACKOFFICE_SESSION_KEY);
  } catch {
    // The in-memory session is still cleared even if browser storage is denied.
  }
}
