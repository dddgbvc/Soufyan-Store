'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, ProviderBadge } from '@/components/glass/Badges';
import { ProviderLoginModal } from '@/components/provider/ProviderLoginModal';
import { useProviders, type ProviderSummary } from './ProviderContext';
import { AUTH_STATE_LABELS } from '@/modules/isp/providers/core/auth';

const NAV = [
  { href: '/isp', label: 'اللوحة' },
  { href: '/isp/subscribers', label: 'المشتركون' },
  { href: '/isp/capabilities', label: 'قدرات المزودين' },
] as const;

function authTone(state: ProviderSummary['authState']) {
  switch (state) {
    case 'AUTHENTICATED':
      return 'ok' as const;
    case 'AUTHENTICATING':
      return 'info' as const;
    case 'ERROR':
      return 'danger' as const;
    case 'EXPIRED':
    case 'REQUIRES_REAUTH':
    case 'REQUIRES_MFA':
      return 'warn' as const;
    default:
      return 'muted' as const;
  }
}

/**
 * Application shell: provider selector, session indicator and navigation.
 *
 * Provider context is visible everywhere (§45) and switching providers never
 * logs the operator out of Yaqoot — only the provider-scoped data changes.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { providers, connected, selected, select, loading, refresh } = useProviders();
  const pathname = usePathname();
  const [loginFor, setLoginFor] = useState<ProviderSummary | null>(null);

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="font-[family-name:var(--font-display)] text-lg font-bold">
            ياقوت <span style={{ color: 'var(--primary)' }}>الإنترنت</span>
          </span>

          <nav className="flex gap-1" aria-label="أقسام الوحدة">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="rounded-lg px-3 py-1.5 text-sm transition-colors"
                  style={{
                    background: active ? 'var(--surface-2)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text-2)',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {/* محدّد المزود — "كل المزودين" يجمّع المقاييس المتوافقة فقط (§19) */}
            <label htmlFor="provider-select" className="sr-only">
              اختر المزود
            </label>
            <select
              id="provider-select"
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm"
              value={selected ?? '__all__'}
              onChange={(e) => select(e.target.value === '__all__' ? null : e.target.value)}
            >
              <option value="__all__">كل المزودين</option>
              {providers.map((p) => (
                <option key={p.provider.id} value={p.provider.id}>
                  {p.provider.displayName}
                </option>
              ))}
            </select>

            {loading ? <Badge tone="muted">جارٍ التحميل…</Badge> : null}
          </div>
        </div>

        {/* شريط حالة الاتصال بكل مزود */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-2">
          {providers.map((p) => {
            const isConnected = p.authState === 'AUTHENTICATED';
            return (
              <div
                key={p.provider.id}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] px-2.5 py-1"
              >
                <ProviderBadge
                  name={p.provider.displayName}
                  logoUrl={p.provider.logoUrl}
                  accent={p.provider.accentColor}
                />
                <Badge tone={authTone(p.authState)} dot pulse={isConnected}>
                  {AUTH_STATE_LABELS[p.authState]}
                </Badge>
                {p.readOnly ? <Badge tone="warn">قراءة فقط</Badge> : null}
                {isConnected ? (
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline"
                    onClick={async () => {
                      await fetch('/api/isp/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'logout', providerId: p.provider.id }),
                      });
                      await refresh();
                    }}
                  >
                    قطع الاتصال
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-xs underline"
                    style={{ color: 'var(--primary)' }}
                    onClick={() => setLoginFor(p)}
                  >
                    اتصال
                  </button>
                )}
              </div>
            );
          })}
          {providers.length === 0 && !loading ? (
            <span className="text-xs text-[var(--muted)]">لا يوجد مزودون مُسجّلون.</span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {connected.length === 0 && !loading ? (
          <div className="glass mb-5 p-4 text-sm text-[var(--text-2)]">
            لم يتم الاتصال بأي مزود بعد. اختر مزوداً من الشريط أعلاه وسجّل الدخول
            ليبدأ اكتشاف الخدمات المتاحة.
          </div>
        ) : null}
        {children}
      </main>

      {loginFor ? (
        <ProviderLoginModal
          open
          provider={{
            id: loginFor.provider.id,
            displayName: loginFor.provider.displayName,
            logoUrl: loginFor.provider.logoUrl,
            accentColor: loginFor.provider.accentColor,
          }}
          onClose={() => setLoginFor(null)}
          onAuthenticated={async () => {
            const id = loginFor.provider.id;
            setLoginFor(null);
            await refresh();
            select(id);
          }}
        />
      ) : null}
    </div>
  );
}
