import type { ReactNode } from 'react';

export interface GlassSurfaceProps {
  children: ReactNode;
  className?: string;
  /** `flat` drops the blur — use behind dense data (§16). */
  variant?: 'glass' | 'flat';
  as?: 'div' | 'section' | 'article' | 'aside';
}

/**
 * The single place that owns the Liquid Glass surface. Every card in the
 * module composes this rather than re-declaring blur/shadow/border, so the
 * design language can be retuned in one file (§30).
 */
export function GlassSurface({
  children,
  className = '',
  variant = 'glass',
  as: Tag = 'div',
}: GlassSurfaceProps) {
  const base = variant === 'flat' ? 'glass glass--flat' : 'glass';
  return <Tag className={`${base} ${className}`.trim()}>{children}</Tag>;
}
