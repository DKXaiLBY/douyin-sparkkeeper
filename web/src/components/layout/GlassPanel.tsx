import clsx from 'clsx';
import type { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: string;
}

/** 通用玻璃面板（设置页区块用），可选标题。 */
export function GlassPanel({ children, className, title, icon }: GlassPanelProps) {
  return (
    <div className={clsx('glass glass-card', className)}>
      {title && (
        <div className="section-title">
          {icon && <span>{icon}</span>}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
