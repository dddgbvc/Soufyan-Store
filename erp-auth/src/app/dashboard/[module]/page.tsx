import { notFound } from 'next/navigation';

import { ModuleIcon } from '@/components/ui/icons';
import { Forbidden } from '@/components/dashboard/Forbidden';
import { guardPage } from '@/server/authz/page';
import * as permissionsRepo from '@/server/db/repositories/permissions';

export const dynamic = 'force-dynamic';

/**
 * Placeholder for the ERP modules that will be built on top of this system.
 *
 * It is a real, guarded route rather than a mock: opening it runs the same
 * server-side `requirePermission` check every future module screen will use,
 * so an employee without `<module>.view` is refused here exactly as they would
 * be in the finished feature.
 */
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await params;

  const modules = await permissionsRepo.listModules();
  const area = modules.find((candidate) => candidate.key === moduleKey);
  if (!area) notFound();

  // Authorization happens here, on the server, before anything is rendered.
  const auth = await guardPage(`${area.key}.view`);
  if (!auth) return <Forbidden permissionKey={`${area.key}.view`} />;

  const catalogue = await permissionsRepo.listPermissions();
  const inModule = catalogue.filter((permission) => permission.module === area.key);
  const held = new Set(auth.permissions);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="animate-rise flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line-soft bg-sunken text-brass">
          <ModuleIcon module={area.key} className="text-2xl" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{area.name}</h1>
          {area.description ? <p className="mt-1 text-sm text-ink-faint">{area.description}</p> : null}
        </div>
      </header>

      <section className="panel animate-rise p-6">
        <h2 className="text-sm font-medium text-ink-dim">صلاحياتك في هذا القسم</h2>
        <ul className="mt-4 space-y-2">
          {inModule.map((permission) => {
            const allowed = held.has(permission.key);
            return (
              <li
                key={permission.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-sunken/50 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className={`block text-sm ${allowed ? 'text-ink' : 'text-ink-faint line-through'}`}>
                    {permission.name}
                  </span>
                  <span className="numeral block text-right text-xs text-ink-faint/80">{permission.key}</span>
                </span>
                <span className={`chip shrink-0 ${allowed ? 'border-success/40 text-success' : ''}`}>
                  {allowed ? 'مسموح' : 'ممنوع'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-center text-xs leading-relaxed text-ink-faint/70">
        هذه شاشة مبدئية. عند بناء القسم الفعلي تُستدعى نفس دالة التحقق
        <span className="numeral"> requirePermission </span>
        قبل كل عملية قراءة أو كتابة.
      </p>
    </div>
  );
}
