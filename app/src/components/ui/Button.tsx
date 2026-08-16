import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { SPRING } from '../../lib/motion';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link';

// نرث خصائص motion لا خصائص button الأصلية: أنواع السحب في framer تختلف عن DOM.
interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  /** يعرض مؤشر انتظار ويمنع النقر المتكرر. */
  loading?: boolean;
  fullWidth?: boolean;
  icon?: LucideIcon;
  /** موضع الأيقونة على المحور المنطقي (البداية = يمين في RTL). */
  iconPosition?: 'start' | 'end';
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // زر حبّة (pill) بتدرّج ملكي وتوهّج اتجاهي خفيف
  primary: cn(
    'bg-sheen-royal text-white shadow-glow-royal',
    'hover:brightness-110 active:brightness-95',
    'disabled:shadow-none',
  ),
  secondary: cn(
    'glass glass-edge text-ink-50 border border-white/10',
    'hover:border-white/20 hover:bg-white/[0.06]',
  ),
  ghost: 'text-ink-300 hover:text-ink-50 hover:bg-white/[0.06]',
  link: 'text-beam-400 hover:text-beam-400/80 underline-offset-4 hover:underline px-1',
};

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  icon: Icon,
  iconPosition = 'end',
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const reduceMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      // الاستجابة تبدأ عند الضغط لا عند الإفلات — لمسة فورية على شاشات نقاط البيع.
      whileTap={reduceMotion || isDisabled ? undefined : { scale: 0.97 }}
      transition={SPRING}
      className={cn(
        'tap-target relative inline-flex items-center justify-center gap-2',
        'rounded-full px-5 text-fluid-sm font-medium',
        'cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow,filter] duration-200 ease-apple',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam-500',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'link' ? 'h-auto min-h-tap' : 'h-12 sm:h-[3.25rem]',
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-[1.15rem] animate-spin" aria-hidden="true" />
      ) : (
        Icon && iconPosition === 'start' && <Icon className="size-[1.15rem]" aria-hidden="true" />
      )}

      <span className="truncate">{children}</span>

      {!loading && Icon && iconPosition === 'end' && (
        <Icon className="size-[1.15rem]" aria-hidden="true" />
      )}
    </motion.button>
  );
}
