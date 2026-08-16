export interface ProtectedFieldDescriptor {
  readonly key: string;
  readonly required_permissions: readonly string[];
  readonly value: unknown;
}

/**
 * Evaluates protected field descriptors against the actor's permissions
 * and returns an object containing only the authorized fields.
 *
 * - Required permissions use ALL-OF semantics.
 * - Denied fields are omitted entirely.
 * - Authorized falsy values (0, false, "", null) are preserved exactly.
 * - Role labels are not accepted as authority (only explicit permissions).
 * - Descriptors must require at least one permission.
 * - Duplicate keys in descriptors are rejected.
 */
export function selectPermissionBoundFields<T extends Record<string, unknown>>(
  actorPermissions: ReadonlySet<string>,
  fields: readonly ProtectedFieldDescriptor[]
): T {
  const result: Record<string, unknown> = {};
  const seenKeys = new Set<string>();

  for (const field of fields) {
    if (field.required_permissions.length === 0) {
      throw new Error(`Protected field descriptor for key "${field.key}" must require at least one permission.`);
    }

    if (seenKeys.has(field.key)) {
      throw new Error(`Duplicate protected field descriptor for key "${field.key}".`);
    }
    seenKeys.add(field.key);

    let authorized = true;
    for (const req of field.required_permissions) {
      if (!actorPermissions.has(req)) {
        authorized = false;
        break;
      }
    }

    if (authorized) {
      result[field.key] = field.value;
    }
  }

  return result as T;
}
