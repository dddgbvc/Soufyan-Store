import { registerAdapter, registeredAdapterKeys, hasAdapter } from './core/registry';
import { createMockAdapter } from './mock/adapter';
import { isMockProfile, type MockProfile } from './mock/profiles';
import { createEarthlinkAdapter } from './earthlink/adapter';

/**
 * Adapter bootstrap (spec §31, step 6).
 *
 * Adding a provider is a one-line change here plus a new folder under
 * providers/. No dashboard, widget, subscriber or billing component changes.
 */

function mockProfileFromEnv(): MockProfile {
  const raw = process.env.ISP_MOCK_PROFILE ?? 'full';
  return isMockProfile(raw) ? raw : 'full';
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

let bootstrapped = false;

export function bootstrapAdapters(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  if (!hasAdapter('mock')) {
    registerAdapter('mock', () =>
      createMockAdapter({
        profile: mockProfileFromEnv(),
        seed: numberFromEnv('ISP_MOCK_SEED', 1404),
        failureRate: numberFromEnv('ISP_MOCK_FAILURE_RATE', 0),
      }),
    );
  }

  if (!hasAdapter('earthlink')) {
    registerAdapter('earthlink', createEarthlinkAdapter);
  }
}

export function enabledAdapterKeys(): readonly string[] {
  bootstrapAdapters();
  const configured = (process.env.ISP_ENABLED_ADAPTERS ?? 'mock,earthlink')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const known = registeredAdapterKeys();
  return configured.filter((k) => known.includes(k));
}
