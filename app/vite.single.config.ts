import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * بناء «ملف واحد»: يُنتج حزمة IIFE كلاسيكية (لا وحدات ES) وملف CSS واحد،
 * ثم يدمجهما `scripts/build-single.mjs` داخل صفحة HTML مستقلة.
 *
 * سبب اختيار IIFE: صفحة تُفتح مباشرة من `file://` (تطبيق «الملفات» على iPad)
 * لا تستطيع تحميل وحدات ES بسبب قيود CORS — بينما السكربت المضمّن الكلاسيكي يعمل.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // ضمّن أي أصل داخل الحزمة
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'bundle.js',
        assetFileNames: 'bundle.[ext]',
      },
    },
  },
});
