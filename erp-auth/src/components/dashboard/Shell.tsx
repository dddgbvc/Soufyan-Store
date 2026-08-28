'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LogoutIcon, ModuleIcon, ShieldIcon, Spinner, UserIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api';
import type { EmployeeSummary, ModuleSummary } from '@/lib/session-types';

interface ShellProps {
  employee: EmployeeSummary;
  modules: ModuleSummary[];
  permissionCount: number;
  children: React.ReactNode;
}

/**
 * The application frame. The navigation is built from the modules the server
 * decided this employee may see — the list arrives already filtered, so the
 * browser is never handed a menu it has to be trusted to hide.
 */
export function Shell({ employee, modules, permissionCount, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating away closes the menu; deferred so the write lands after paint.
  useEffect(() => {
    const timer = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Even if the call fails the local session is unusable; move on.
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="relative z-10 flex min-h-dvh flex-col lg:flex-row">
      {/* ---------------------------------------------------------------- */}
      <aside className="hidden w-64 shrink-0 border-l border-line-soft bg-panel/40 p-4 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto">
        <Link href="/dashboard" className="mb-6 flex items-center gap-3 rounded-2xl p-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-line-soft bg-sunken text-brass">
            <ShieldIcon className="text-lg" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">نظام الإدارة</span>
            <span className="block text-xs text-ink-faint">ERP</span>
          </span>
        </Link>

        <NavList modules={modules} pathname={pathname} />

        <div className="mt-auto space-y-3 pt-4">
          <IdentityCard employee={employee} permissionCount={permissionCount} />
          <button type="button" className="btn btn-ghost w-full" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <Spinner /> : <LogoutIcon />}
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line-soft bg-canvas/85 px-4 py-3 backdrop-blur-xl lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-line-soft bg-sunken text-brass">
              <ShieldIcon />
            </span>
            <span className="text-sm font-semibold text-ink">نظام الإدارة</span>
          </Link>

          <div className="hidden min-w-0 lg:block">
            <Today />
          </div>

          <div className="relative">
            <button
              type="button"
              className="btn btn-ghost gap-2 py-2"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <UserIcon />
              <span className="max-w-[9rem] truncate text-sm">{employee.fullName}</span>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="panel animate-fade absolute end-0 top-full z-40 mt-2 w-60 p-3"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <IdentityCard employee={employee} permissionCount={permissionCount} />
                <Link href="/dashboard/me" role="menuitem" className="btn btn-ghost mt-3 w-full justify-start">
                  حسابي وأجهزتي
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="btn btn-ghost mt-2 w-full justify-start"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                >
                  {signingOut ? <Spinner /> : <LogoutIcon />}
                  تسجيل الخروج
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        {/* Mobile navigation: the same server-filtered module list. */}
        <nav className="sticky bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-line-soft bg-canvas/90 px-2 py-2 backdrop-blur-xl lg:hidden">
          {modules.map((module) => {
            const href = module.route ?? `/dashboard/${module.key}`;
            const active = pathname === href;
            return (
              <Link
                key={module.key}
                href={href}
                className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.7rem] ${
                  active ? 'bg-raised text-brass' : 'text-ink-faint'
                }`}
              >
                <ModuleIcon module={module.key} className="text-lg" />
                <span className="truncate">{module.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Today's date, rendered after mount so server and client never disagree. */
function Today() {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    // Client-only value, deferred a tick so it does not re-render mid-effect.
    const timer = window.setTimeout(
      () =>
        setToday(
          new Date().toLocaleDateString('ar-IQ', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return <p className="truncate text-sm text-ink-faint">{today ?? ''}</p>;
}

function NavList({ modules, pathname }: { modules: ModuleSummary[]; pathname: string }) {
  const business = modules.filter((module) => !module.isAdmin);
  const admin = modules.filter((module) => module.isAdmin);

  return (
    <nav className="space-y-6">
      <NavGroup label="الأقسام" modules={business} pathname={pathname} />
      {admin.length > 0 ? <NavGroup label="الإدارة" modules={admin} pathname={pathname} /> : null}
    </nav>
  );
}

function NavGroup({ label, modules, pathname }: { label: string; modules: ModuleSummary[]; pathname: string }) {
  if (modules.length === 0) return null;

  return (
    <div>
      <p className="mb-2 px-3 text-xs font-medium tracking-wide text-ink-faint">{label}</p>
      <ul className="space-y-1">
        {modules.map((module) => {
          const href = module.route ?? `/dashboard/${module.key}`;
          const active = pathname === href;
          return (
            <li key={module.key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-raised text-ink shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)]'
                    : 'text-ink-dim hover:bg-raised/50 hover:text-ink'
                }`}
              >
                <ModuleIcon module={module.key} className={`text-lg ${active ? 'text-brass' : ''}`} />
                {module.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IdentityCard({ employee, permissionCount }: { employee: EmployeeSummary; permissionCount: number }) {
  return (
    <div className="rounded-2xl border border-line-soft bg-sunken/60 p-3">
      <p className="truncate text-sm font-medium text-ink">{employee.fullName}</p>
      <p className="truncate text-xs text-ink-faint">{employee.jobTitle ?? employee.employeeCode}</p>
      <p className="mt-2 flex flex-wrap gap-1.5">
        {employee.isOwner ? <span className="chip border-brass/40 text-brass">مالك النظام</span> : null}
        <span className="chip">
          <span className="numeral">{permissionCount}</span> صلاحية
        </span>
      </p>
    </div>
  );
}
