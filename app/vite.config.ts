import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// المنظومة تُنشر تحت المسار /app/ بجانب الموقع التعريفي في جذر المستودع.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
