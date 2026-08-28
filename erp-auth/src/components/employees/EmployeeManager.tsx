'use client';

import { useCallback, useMemo, useState } from 'react';

import { PermissionEditor } from '@/components/employees/PermissionEditor';
import { PinPad } from '@/components/auth/PinPad';
import { Alert } from '@/components/ui/Alert';
import { Sheet } from '@/components/ui/Sheet';
import { DeviceIcon, LockIcon, PlusIcon, SearchIcon, Spinner, UserIcon } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';
import type { EmployeeSummary, ModuleSummary, PermissionSummary } from '@/lib/session-types';

interface EmployeeManagerProps {
  initialEmployees: EmployeeSummary[];
  modules: ModuleSummary[];
  permissions: PermissionSummary[];
  pinLength: number;
  /** Capabilities of the person *using* this screen. */
  can: {
    create: boolean;
    update: boolean;
    remove: boolean;
    permissions: boolean;
  };
  currentEmployeeId: string;
}

type Panel = 'none' | 'create' | 'detail' | 'permissions' | 'pin';

const STATUS_LABEL: Record<EmployeeSummary['status'], string> = {
  active: 'نشط',
  disabled: 'معطّل',
  suspended: 'موقوف',
};

/**
 * Employee administration.
 *
 * Every button here mirrors a server-side capability check; the `can` flags
 * only decide whether a control is worth showing. Pressing a hidden one by
 * other means still fails at the API.
 */
export function EmployeeManager({
  initialEmployees,
  modules,
  permissions,
  pinLength,
  can,
  currentEmployeeId,
}: EmployeeManagerProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>('none');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [grants, setGrants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = employees.find((employee) => employee.id === activeId) ?? null;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) =>
      [employee.fullName, employee.employeeCode, employee.email ?? ''].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [employees, search]);

  const refresh = useCallback(async () => {
    const result = await apiFetch<{ employees: EmployeeSummary[] }>('/api/employees');
    setEmployees(result.employees);
  }, []);

  const openDetail = useCallback(async (employee: EmployeeSummary) => {
    setActiveId(employee.id);
    setError(null);
    setNotice(null);
    setPanel('detail');

    try {
      const detail = await apiFetch<{ permissions: string[] }>(`/api/employees/${employee.id}`);
      setGrants(detail.permissions);
    } catch {
      setGrants([]);
    }
  }, []);

  async function run(action: () => Promise<void>, successMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      if (successMessage) setNotice(successMessage);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'تعذّر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">الموظفون</h1>
          <p className="mt-1 text-sm text-ink-faint">
            <span className="numeral">{employees.length}</span> حساب — كل موظف بصلاحياته الخاصة
          </p>
        </div>

        {can.create ? (
          <button type="button" className="btn btn-primary" onClick={() => setPanel('create')}>
            <PlusIcon />
            إضافة موظف
          </button>
        ) : null}
      </header>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-y-0 start-4 my-auto text-ink-faint" />
        <input
          type="search"
          className="field ps-11"
          placeholder="ابحث بالاسم أو الرمز أو البريد"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="stagger space-y-2">
        {filtered.map((employee) => (
          <li key={employee.id}>
            <button
              type="button"
              className="panel flex w-full items-center gap-4 p-4 text-start transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line"
              onClick={() => void openDetail(employee)}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line-soft bg-sunken text-ink-faint">
                <UserIcon className="text-xl" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-ink">{employee.fullName}</span>
                  {employee.isOwner ? <span className="chip border-brass/40 text-brass">مالك</span> : null}
                  {employee.id === currentEmployeeId ? <span className="chip">أنت</span> : null}
                </span>
                <span className="numeral block truncate text-right text-xs text-ink-faint">
                  {employee.employeeCode}
                  {employee.email ? ` · ${employee.email}` : ''}
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`chip ${
                    employee.status === 'active' ? 'border-success/40 text-success' : 'border-danger/40 text-danger'
                  }`}
                >
                  {STATUS_LABEL[employee.status]}
                </span>
                {employee.isLocked ? <span className="chip border-caution/40 text-caution">موقوف مؤقتاً</span> : null}
                {!employee.hasPin ? <span className="chip">بلا رمز</span> : null}
              </span>
            </button>
          </li>
        ))}

        {filtered.length === 0 ? (
          <li className="panel p-8 text-center text-sm text-ink-faint">لا توجد نتائج مطابقة.</li>
        ) : null}
      </ul>

      {/* ---------------------------------------------------------------- */}

      <Sheet open={panel === 'create'} onClose={() => setPanel('none')} title="إضافة موظف">
        <CreateEmployeeForm
          pinLength={pinLength}
          busy={busy}
          onSubmit={async (payload) => {
            await run(async () => {
              await apiFetch('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
              setPanel('none');
            }, 'تمت إضافة الموظف.');
          }}
        />
      </Sheet>

      <Sheet
        open={panel === 'detail' && Boolean(active)}
        onClose={() => setPanel('none')}
        title={active?.fullName ?? ''}
        description={active?.jobTitle ?? active?.employeeCode}
      >
        {active ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="الرمز الوظيفي" value={active.employeeCode} mono />
              <Detail label="الحالة" value={STATUS_LABEL[active.status]} />
              <Detail label="البريد" value={active.email ?? '—'} mono />
              <Detail label="الهاتف" value={active.phone ?? '—'} mono />
              <Detail
                label="آخر دخول"
                value={active.lastLoginAt ? new Date(active.lastLoginAt).toLocaleString('ar-IQ') : 'لم يدخل بعد'}
              />
              <Detail label="رمز الدخول" value={active.hasPin ? 'معيَّن' : 'غير معيَّن'} />
            </dl>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <div className="grid gap-2">
              {can.permissions ? (
                <button
                  type="button"
                  className="btn btn-ghost justify-start"
                  onClick={() => setPanel('permissions')}
                >
                  <LockIcon />
                  إدارة الصلاحيات <span className="numeral">({grants.length})</span>
                </button>
              ) : null}

              {can.update ? (
                <button type="button" className="btn btn-ghost justify-start" onClick={() => setPanel('pin')}>
                  <LockIcon />
                  تعيين رمز دخول أولي
                </button>
              ) : null}

              {can.update ? (
                <button
                  type="button"
                  className="btn btn-ghost justify-start"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await apiFetch(`/api/employees/${active.id}/sessions`, {
                        method: 'POST',
                        body: JSON.stringify({ reason: 'revoked_by_admin' }),
                      });
                    }, 'تم إنهاء جميع جلسات هذا الموظف.')
                  }
                >
                  <DeviceIcon />
                  إنهاء كل جلساته
                </button>
              ) : null}

              {can.update && active.id !== currentEmployeeId ? (
                <button
                  type="button"
                  className="btn btn-ghost justify-start"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await apiFetch(`/api/employees/${active.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: active.status === 'active' ? 'disabled' : 'active' }),
                      });
                    }, active.status === 'active' ? 'تم تعطيل الحساب.' : 'تمت إعادة تفعيل الحساب.')
                  }
                >
                  <UserIcon />
                  {active.status === 'active' ? 'تعطيل الحساب' : 'إعادة تفعيل الحساب'}
                </button>
              ) : null}

              {can.remove && active.id !== currentEmployeeId && !active.isOwner ? (
                <button
                  type="button"
                  className="btn btn-ghost justify-start text-danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`حذف حساب ${active.fullName} نهائياً؟`)) return;
                    void run(async () => {
                      await apiFetch(`/api/employees/${active.id}`, { method: 'DELETE' });
                      setPanel('none');
                    }, 'تم حذف الحساب.');
                  }}
                >
                  حذف الحساب نهائياً
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={panel === 'permissions' && Boolean(active)}
        onClose={() => setPanel('detail')}
        title="الصلاحيات"
        description={active?.fullName}
      >
        {active?.isOwner ? (
          <Alert tone="info">حساب المالك يملك كل الصلاحيات تلقائياً ولا يمكن تقييده.</Alert>
        ) : (
          <div className="space-y-5">
            <PermissionEditor
              modules={modules}
              permissions={permissions}
              selected={grants}
              onChange={setGrants}
              disabled={busy}
            />

            {error ? <Alert tone="error">{error}</Alert> : null}

            <button
              type="button"
              className="btn btn-primary sticky bottom-0 w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await apiFetch(`/api/employees/${active!.id}/permissions`, {
                    method: 'PUT',
                    body: JSON.stringify({ permissions: grants }),
                  });
                  setPanel('detail');
                }, 'تم حفظ الصلاحيات.')
              }
            >
              {busy ? <Spinner /> : null}
              حفظ الصلاحيات
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={panel === 'pin' && Boolean(active)}
        onClose={() => setPanel('detail')}
        title="تعيين رمز دخول أولي"
        description="سيُطلب من الموظف تغييره عند أول دخول"
      >
        <AssignPinForm
          pinLength={pinLength}
          busy={busy}
          error={error}
          onSubmit={(pin) =>
            void run(async () => {
              await apiFetch(`/api/employees/${active!.id}/pin`, {
                method: 'POST',
                body: JSON.stringify({ pin }),
              });
              setPanel('detail');
            }, 'تم تعيين الرمز الأولي.')
          }
        />
      </Sheet>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-line-soft bg-sunken/50 px-3 py-2">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm text-ink-dim ${mono ? 'numeral' : ''}`}>{value}</dd>
    </div>
  );
}

interface CreatePayload {
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  initialPin: string | null;
}

function CreateEmployeeForm({
  pinLength,
  busy,
  onSubmit,
}: {
  pinLength: number;
  busy: boolean;
  onSubmit: (payload: CreatePayload) => Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [pin, setPin] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          jobTitle: jobTitle.trim() || null,
          initialPin: pin.length === pinLength ? pin : null,
        });
      }}
    >
      <label className="block space-y-2">
        <span className="text-sm text-ink-dim">الاسم الكامل</span>
        <input className="field" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-ink-dim">
          البريد الإلكتروني <span className="text-ink-faint">(لاسترجاع الرمز)</span>
        </span>
        <input
          type="email"
          dir="ltr"
          className="field text-start"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-2">
          <span className="text-sm text-ink-dim">الهاتف</span>
          <input
            dir="ltr"
            className="field text-start"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-ink-dim">المسمى الوظيفي</span>
          <input className="field" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-line-soft bg-sunken/40 p-4">
        <p className="text-sm text-ink-dim">
          رمز دخول أولي <span className="text-ink-faint">(اختياري — يُغيَّر عند أول دخول)</span>
        </p>
        <PinPad length={pinLength} value={pin} onChange={setPin} disabled={busy} />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy || fullName.trim().length < 2}>
        {busy ? <Spinner /> : <PlusIcon />}
        إنشاء الحساب
      </button>
    </form>
  );
}

function AssignPinForm({
  pinLength,
  busy,
  error,
  onSubmit,
}: {
  pinLength: number;
  busy: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');

  return (
    <div className="space-y-5">
      <PinPad
        length={pinLength}
        value={pin}
        onChange={setPin}
        disabled={busy}
        state={error ? 'error' : busy ? 'verifying' : 'idle'}
        onComplete={(value) => onSubmit(value)}
        hint={<span className="text-ink-faint">لا يمكن أن يتطابق مع رمز موظف آخر</span>}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
