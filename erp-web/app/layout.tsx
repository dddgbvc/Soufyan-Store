import type { Metadata } from 'next';
import './thmanyah-fonts.css';
import './google-fonts.css';
import './globals.css';
export const metadata: Metadata = {title:'ياقوت | مكتب سفيان للموبايل',description:'مساحة عمل موحدة لإدارة المبيعات والمخزون والديون لمكتب سفيان للموبايل',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icons/icon-180.png'},appleWebApp:{capable:true,title:'ياقوت ERP',statusBarStyle:'default'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
