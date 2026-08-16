/**
 * يدمج ناتج `vite.single.config.ts` في صفحة HTML واحدة مستقلة تمامًا.
 *
 * الناتج: `standalone/soufyan-erp-auth.html`
 * تعمل بالنقر المزدوج أو بفتحها من تطبيق «الملفات» على iPad/iPhone،
 * بلا npm ولا خادم ولا اتصال (عدا الخط الذي له بدائل نظامية).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist-single');
const outFile = resolve(root, 'standalone/soufyan-erp-auth.html');

const [js, css] = await Promise.all([
  readFile(resolve(distDir, 'bundle.js'), 'utf8'),
  readFile(resolve(distDir, 'bundle.css'), 'utf8'),
]);

// `</script>` داخل نص السكربت ينهي الوسم مبكرًا — نهرّب الشرطة المائلة.
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=5.0">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#070B14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="منظومة سفيان">
<meta name="mobile-web-app-capable" content="yes">
<title>منظومة سفيان | بوابة الدخول والتهيئة</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${safeJs}
</script>
</body>
</html>
`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`✓ standalone/soufyan-erp-auth.html — ${kb} KB (ملف واحد مستقل)`);
