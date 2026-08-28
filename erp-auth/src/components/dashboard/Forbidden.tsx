import Link from 'next/link';

import { LockIcon } from '@/components/ui/icons';

/**
 * Shown when the server refuses a page. It names the missing capability so the
 * employee can ask for the right thing, without hinting at what lies behind it.
 */
export function Forbidden({ permissionKey }: { permissionKey?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line-soft bg-sunken text-ink-faint">
        <LockIcon className="text-2xl" />
      </span>

      <div>
        <h1 className="text-lg font-semibold text-ink">لا تملك صلاحية لفتح هذه الشاشة</h1>
        <p className="mt-2 text-sm text-ink-faint">راجع المدير لإسناد الصلاحية المطلوبة إلى حسابك.</p>
      </div>

      {permissionKey ? <p className="numeral chip">{permissionKey}</p> : null}

      <Link href="/dashboard" className="btn btn-ghost mt-2">
        الرجوع للرئيسية
      </Link>
    </div>
  );
}
