import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="numeral text-5xl font-semibold text-brass">404</p>
      <h1 className="text-lg font-semibold text-ink">الصفحة غير موجودة</h1>
      <Link href="/" className="btn btn-ghost">
        الرجوع للبداية
      </Link>
    </main>
  );
}
