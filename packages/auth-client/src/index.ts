import type { AuthContextResponse } from "@kastur/contracts";

/**
 * Evaluates whether a given permission is present in the cached authorization snapshot.
 *
 * This is a UX/offline-context convenience helper. It does NOT replace authoritative
 * server permission validation. Role label alone does not grant authority.
 *
 * @param authContext The cached authorization context snapshot.
 * @param permissionCode The specific permission code to check.
 * @returns boolean True if the permission explicitly exists in the snapshot.
 */
export function hasCachedPermission(
  authContext: AuthContextResponse | undefined | null,
  permissionCode: string,
): boolean {
  if (!authContext || !authContext.permissions) {
    return false;
  }
  return authContext.permissions.includes(permissionCode);
}
