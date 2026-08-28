/**
 * Client-safe permission helpers.
 *
 * These drive what the interface *shows*. They are a usability layer only:
 * every capability is enforced again on the server, which never trusts the
 * list the browser happens to be holding.
 */

export function can(permissions: readonly string[], key: string): boolean {
  return permissions.includes(key);
}

export function canAny(permissions: readonly string[], keys: readonly string[]): boolean {
  return keys.some((key) => permissions.includes(key));
}

export function canAll(permissions: readonly string[], keys: readonly string[]): boolean {
  return keys.every((key) => permissions.includes(key));
}

/** True when the employee can see a module at all (holds any key inside it). */
export function canAccessModule(permissions: readonly string[], moduleKey: string): boolean {
  const prefix = `${moduleKey}.`;
  return permissions.some((key) => key.startsWith(prefix));
}

export function moduleOf(permissionKey: string): string {
  return permissionKey.split('.')[0] ?? '';
}

/** Groups a flat key list by module, preserving the given order. */
export function groupByModule<T extends { key: string; module: string }>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const bucket = grouped.get(item.module);
    if (bucket) bucket.push(item);
    else grouped.set(item.module, [item]);
  }
  return grouped;
}
