'use client';

import { useMemo } from 'react';

import { ModuleIcon } from '@/components/ui/icons';
import { groupByModule } from '@/lib/permissions';
import type { ModuleSummary, PermissionSummary } from '@/lib/session-types';

interface PermissionEditorProps {
  modules: ModuleSummary[];
  permissions: PermissionSummary[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * The capability tree.
 *
 * Grants are individual by design — there is no role to pick — so the editor
 * has to make a long flat list navigable: modules group it, a module row
 * toggles its whole branch, and destructive capabilities are marked so they
 * are never handed out by accident.
 */
export function PermissionEditor({
  modules,
  permissions,
  selected,
  onChange,
  disabled = false,
}: PermissionEditorProps) {
  const grouped = useMemo(() => groupByModule(permissions), [permissions]);
  const chosen = useMemo(() => new Set(selected), [selected]);

  function toggle(key: string) {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  }

  function toggleModule(moduleKey: string, enable: boolean) {
    const keys = (grouped.get(moduleKey) ?? []).map((permission) => permission.key);
    const next = new Set(chosen);
    for (const key of keys) {
      if (enable) next.add(key);
      else next.delete(key);
    }
    onChange([...next]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs text-ink-faint">
        <span>
          مُحدَّد: <span className="numeral">{selected.length}</span> من{' '}
          <span className="numeral">{permissions.length}</span>
        </span>
        <button type="button" className="btn btn-quiet" disabled={disabled} onClick={() => onChange([])}>
          مسح الكل
        </button>
      </div>

      {modules.map((module) => {
        const items = grouped.get(module.key) ?? [];
        if (items.length === 0) return null;

        const granted = items.filter((permission) => chosen.has(permission.key)).length;
        const all = granted === items.length;
        const some = granted > 0 && !all;

        return (
          <fieldset key={module.key} className="rounded-2xl border border-line-soft bg-sunken/40 p-3">
            <legend className="sr-only">{module.name}</legend>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-raised/40">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-brass)]"
                checked={all}
                ref={(element) => {
                  if (element) element.indeterminate = some;
                }}
                disabled={disabled}
                onChange={(event) => toggleModule(module.key, event.target.checked)}
              />
              <ModuleIcon module={module.key} className="text-lg text-brass" />
              <span className="flex-1 text-sm font-medium text-ink">{module.name}</span>
              <span className="chip numeral shrink-0">{`${granted}/${items.length}`}</span>
            </label>

            <ul className="mt-1 space-y-0.5 ps-6">
              {items.map((permission) => (
                <li key={permission.key}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-raised/40">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[var(--color-brass)]"
                      checked={chosen.has(permission.key)}
                      disabled={disabled}
                      onChange={() => toggle(permission.key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-ink-dim">{permission.name}</span>
                        {permission.isDangerous ? (
                          <span className="chip border-caution/40 text-caution">حسّاسة</span>
                        ) : null}
                      </span>
                      <span className="numeral block text-right text-[0.7rem] text-ink-faint/70">{permission.key}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}
