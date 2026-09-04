import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ياقوت — وحدة مزودي الإنترنت',
  description: 'إدارة المشتركين والاشتراكات والمحافظ عبر عدة مزودي إنترنت داخل ياقوت ERP.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#14161c' },
  ],
};

/**
 * العربية هي اللغة الأساسية و RTL هو الاتجاه الافتراضي (§28).
 * الخطوط نفسها المستخدمة في واجهة متجر سفيان حتى تبدو الوحدة جزءاً من ياقوت.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Loaded via <link> rather than next/font on purpose: these are the exact
          faces the existing Yaqoot storefront already serves, and next/font
          fetches at build time, which breaks builds on an offline runner.
          The rule below assumes the pages router, where it would apply per page.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
