import clsx from 'clsx';
import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  span?: 4 | 5 | 6 | 7 | 8 | 12;
}

/** 液态玻璃卡片容器（带网格跨度）。 */
export function GlassCard({ children, className, span = 12 }: GlassCardProps) {
  return (
    <section className={clsx('glass glass-card', `span${span}`, className)}>
      {children}
    </section>
  );
}
