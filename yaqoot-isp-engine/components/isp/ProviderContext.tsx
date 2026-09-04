'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CapabilityManifest } from '@/modules/isp/capabilities/manifest';
import type { AuthState } from '@/modules/isp/providers/core/auth';
import type { Provider } from '@/modules/isp/core/types';
import type { ProviderManifest } from '@/modules/isp/capabilities/resolver';

export interface ProviderSummary {
  readonly provider: Provider;
  readonly authState: AuthState;
  readonly agentDisplayName: string | null;
  readonly capabilities: CapabilityManifest;
  readonly readOnly: boolean;
  readonly requiresAuth: boolean;
}

/** `null` = the "All Providers" aggregate view (§19). */
export type SelectedProvider = string | null;

interface ProviderContextValue {
  readonly providers: readonly ProviderSummary[];
  readonly loading: boolean;
  readonly selected: SelectedProvider;
  readonly select: (id: SelectedProvider) => void;
  readonly refresh: () => Promise<void>;
  /** The active provider, or null in aggregate mode. */
  readonly active: ProviderSummary | null;
  /** Connected providers only — the basis for any aggregate metric. */
  readonly connected: readonly ProviderSummary[];
  /** Shape the capability resolver expects for aggregation. */
  readonly manifests: readonly ProviderManifest[];
}

const Ctx = createContext<ProviderContextValue | null>(null);

export function ProviderProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedProvider>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/isp/providers', { cache: 'no-store' });
      const body = (await response.json()) as { providers?: ProviderSummary[] };
      setProviders(body.providers ?? []);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Land on the first connected provider so the operator sees data, not a picker.
  useEffect(() => {
    if (selected !== null || providers.length === 0) return;
    const firstConnected = providers.find((p) => p.authState === 'AUTHENTICATED');
    if (firstConnected) setSelected(firstConnected.provider.id);
  }, [providers, selected]);

  const value = useMemo<ProviderContextValue>(() => {
    const connected = providers.filter((p) => p.authState === 'AUTHENTICATED');
    return {
      providers,
      loading,
      selected,
      select: setSelected,
      refresh,
      active: selected === null ? null : (providers.find((p) => p.provider.id === selected) ?? null),
      connected,
      manifests: connected.map((p) => ({
        providerId: p.provider.id,
        providerName: p.provider.displayName,
        manifest: p.capabilities,
      })),
    };
  }, [providers, loading, selected, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProviders(): ProviderContextValue {
  const ctx = useContext(Ctx);
  if (ctx === null) {
    throw new Error('useProviders must be used inside <ProviderProvider>.');
  }
  return ctx;
}
