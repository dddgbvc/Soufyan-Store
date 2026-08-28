import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Readex_Pro } from 'next/font/google';

import './globals.css';

const readex = Readex_Pro({
  variable: '--font-readex',
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'نظام الدخول والصلاحيات',
  description: 'نظام مصادقة وصلاحيات لموظفي الـERP',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#141821',
  width: 'device-width',
  initialScale: 1,
  // The keypad must never trigger a pinch-zoom, but zooming stays available.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${readex.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="relative isolate flex min-h-full flex-col">{children}</body>
    </html>
  );
}
