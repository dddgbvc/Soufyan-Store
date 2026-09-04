import type { ISPProviderAdapter } from './adapter';

/**
 * Adapter registry (spec §31).
 *
 * Registering a new provider is the whole integration surface: build an
 * adapter, declare capabilities, register it here. No dashboard, widget or
 * subscriber component changes.
 */

export type AdapterFactory = () => ISPProviderAdapter;

const factories = new Map<string, AdapterFactory>();
const instances = new Map<string, ISPProviderAdapter>();

export function registerAdapter(key: string, factory: AdapterFactory): void {
  if (factories.has(key)) {
    throw new Error(`Adapter "${key}" is already registered.`);
  }
  factories.set(key, factory);
}

export function getAdapter(key: string): ISPProviderAdapter {
  const existing = instances.get(key);
  if (existing) return existing;

  const factory = factories.get(key);
  if (!factory) {
    throw new Error(
      `Unknown adapter "${key}". Registered: ${[...factories.keys()].join(', ') || '(none)'}.`,
    );
  }

  const adapter = factory();
  instances.set(key, adapter);
  return adapter;
}

export function hasAdapter(key: string): boolean {
  return factories.has(key);
}

export function registeredAdapterKeys(): readonly string[] {
  return [...factories.keys()];
}

/** Test helper — drops instances so a fresh factory runs next time. */
export function resetAdapterInstances(): void {
  instances.clear();
}

/** Test helper — clears the registry entirely. */
export function clearRegistry(): void {
  factories.clear();
  instances.clear();
}
