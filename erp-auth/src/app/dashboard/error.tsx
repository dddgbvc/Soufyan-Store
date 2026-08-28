'use client';

import Link from 'next/link';

import { AlertIcon } from '@/components/ui/icons';

/** Last-resort boundary. Details stay on the server; the user gets a way out. */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-danger/40 bg-danger-soft text-danger">
        <AlertIcon className="text-2xl" />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-ink">تعذّر عرض هذه الشاشة</h1>
        <p className="mt-2 text-sm text-ink-faint">حدث خطأ غير متوقع. حاول مرة أخرى.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          إعادة المحاولة
        </button>
        <Link href="/dashboard" className="btn btn-ghost">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}
