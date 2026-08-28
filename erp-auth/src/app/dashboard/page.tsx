import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ModuleIcon } from '@/components/ui/icons';
import { canAccessModule } from '@/lib/permissions';
import { getSession } from '@/server/auth/session';
import * as permissionsRepo from '@/server/db/repositories/permissions';

export const dynamic = 'force-dynamic';

/**
 * The landing view. Nothing here is decorative: the cards are exactly the
 * modules this employee is allowed to open, and the counts come from their
 * real grants rather than a hard-coded role.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [permissions, modules, catalogue] = await Promise.all([
    permissionsRepo.keysForEmployee(session.employee.id),
    permissionsRepo.listModules(),
    permissionsRepo.listPermissions(),
  ]);

  const visible = modules.filter((module) => canAccessModule(permissions, module.key));
  const held = new Set(permissions);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header className="animate-rise space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          هلا بيك {session.employee.fullName} 👋
        </h1>
        <p className="text-sm text-ink-faint">
          لديك <span className="numeral">{permissions.length}</span> صلاحية موزّعة على{' '}
          <span className="numeral">{visible.length}</span> قسم.
        </p>
      </header>

      {visible.length === 0 ? (
        <div className="panel animate-rise p-8 text-center">
          <p className="text-ink-dim">لا توجد صلاحيات مُسندة لحسابك بعد.</p>
          <p className="mt-2 text-sm text-ink-faint">راجع المدير لإسناد الصلاحيات المناسبة.</p>
        </div>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((module) => {
            const inModule = catalogue.filter((permission) => permission.module === module.key);
            const granted = inModule.filter((permission) => held.has(permission.key));

            return (
              <Link
                key={module.key}
                href={module.route ?? `/dashboard/${module.key}`}
                className="panel group flex flex-col gap-3 p-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line"
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-line-soft bg-sunken text-brass transition-colors group-hover:border-brass/40">
                    <ModuleIcon module={module.key} className="text-xl" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{module.name}</span>
                    <span className="block text-xs text-ink-faint">
                      <span className="numeral">{granted.length}</span> من{' '}
                      <span className="numeral">{inModule.length}</span> صلاحية
                    </span>
                  </span>
                </span>

                {module.description ? (
                  <span className="text-sm leading-relaxed text-ink-faint">{module.description}</span>
                ) : null}

                <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {granted.slice(0, 4).map((permission) => (
                    <span key={permission.key} className="chip">
                      {permission.name}
                    </span>
                  ))}
                  {granted.length > 4 ? <span className="chip">+{granted.length - 4}</span> : null}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
