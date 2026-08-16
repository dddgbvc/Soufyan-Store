/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // القاعدة: أونيكس / سليت عميق
        onyx: {
          950: '#04070E',
          900: '#070B14',
          850: '#0A0F1D',
          800: '#0E1526',
          750: '#121B2F',
          700: '#17223A',
        },
        // الأزرق الملكي (اللون الأساسي)
        royal: {
          50: '#EFF5FF',
          200: '#BFD4FE',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          900: '#1E3A8A',
        },
        // السماوي المضيء (حالة التركيز)
        beam: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        // الزمردي (التحقق والنجاح)
        verify: {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        ink: {
          50: '#F8FAFC',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
        },
      },
      fontFamily: {
        sans: [
          'Tajawal',
          'IBM Plex Sans Arabic',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['IBM Plex Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // مقاييس مرنة تتدرّج مع عرض الشاشة
        'fluid-xs': 'clamp(0.72rem, 0.68rem + 0.18vw, 0.82rem)',
        'fluid-sm': 'clamp(0.8rem, 0.75rem + 0.22vw, 0.92rem)',
        'fluid-base': 'clamp(0.92rem, 0.87rem + 0.26vw, 1.02rem)',
        'fluid-lg': 'clamp(1.05rem, 0.98rem + 0.38vw, 1.25rem)',
        'fluid-xl': 'clamp(1.25rem, 1.1rem + 0.7vw, 1.6rem)',
        'fluid-2xl': 'clamp(1.5rem, 1.25rem + 1.1vw, 2.15rem)',
        'fluid-3xl': 'clamp(1.85rem, 1.4rem + 1.9vw, 2.9rem)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.75rem',
      },
      spacing: {
        // مناطق الأمان لأجهزة iOS / Android
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-l': 'env(safe-area-inset-left, 0px)',
        'safe-r': 'env(safe-area-inset-right, 0px)',
        tap: '2.75rem', // 44px — الحد الأدنى لمساحة اللمس
      },
      minHeight: {
        tap: '2.75rem',
        dvh: '100dvh',
      },
      minWidth: {
        tap: '2.75rem',
      },
      boxShadow: {
        acrylic:
          '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 24px 70px -20px rgb(2 6 23 / 0.85), 0 8px 24px -12px rgb(2 6 23 / 0.7)',
        'glow-royal': '0 10px 40px -12px rgb(37 99 235 / 0.55)',
        'glow-beam': '0 0 0 1px rgb(6 182 212 / 0.35), 0 12px 40px -14px rgb(6 182 212 / 0.45)',
        'glow-verify': '0 0 0 1px rgb(16 185 129 / 0.3), 0 16px 50px -16px rgb(16 185 129 / 0.5)',
        field: '0 1px 0 0 rgb(255 255 255 / 0.04) inset',
      },
      backgroundImage: {
        mica: 'radial-gradient(120% 120% at 100% 0%, rgb(37 99 235 / 0.18) 0%, transparent 55%), radial-gradient(120% 120% at 0% 100%, rgb(6 182 212 / 0.14) 0%, transparent 50%)',
        'sheen-royal': 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 55%, #0891B2 100%)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)', opacity: '0.55' },
          '50%': { transform: 'translate3d(-4%, 3%, 0) scale(1.12)', opacity: '0.8' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};
