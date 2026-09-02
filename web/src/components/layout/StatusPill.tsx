import clsx from 'clsx';

interface StatusPillProps {
  label: string;
  state?: 'ok' | 'off' | 'bad';
}

/** 状态胶囊（带彩色圆点）。 */
export function StatusPill({ label, state = 'ok' }: StatusPillProps) {
  return (
    <span className="pill">
      <span className={clsx('status-dot', state === 'ok' ? '' : state)} />
      {label}
    </span>
  );
}
