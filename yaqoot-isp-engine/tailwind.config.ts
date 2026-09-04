import type { Config } from 'tailwindcss';

/**
 * Every colour here resolves to a CSS variable declared in app/globals.css.
 * Design tokens are centralised there (Liquid Glass rule in the spec: never
 * scatter hard-coded colours and shadows across components).
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        cta: 'var(--cta)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        muted: 'var(--muted)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        glass: 'var(--radius)',
        'glass-sm': 'calc(var(--radius) - 6px)',
      },
      boxShadow: {
        glass: 'var(--shadow)',
        glow: 'var(--glow)',
      },
      backdropBlur: {
        glass: '14px',
      },
      transitionTimingFunction: {
        glass: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
        'status-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'status-pulse': 'status-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
