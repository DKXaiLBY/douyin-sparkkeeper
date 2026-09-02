import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlassCard } from '@/components/layout/GlassCard.tsx';
import type { HeatCell } from '@/api/types.ts';

interface HeatCalendarProps {
  heatmap: HeatCell[];
}

/** 主视图网格：3 行 × 10 列 = 近 30 天；更多数据通过「查看完整日历」二级弹窗看。 */
const MAIN_DAYS = 30;

const STATUS_LABEL: Record<HeatCell['status'], string> = {
  done: '已续',
  missed: '断更',
  none: '未发',
};

const STATUS_CLASS: Record<HeatCell['status'], string> = {
  done: 'on',
  missed: 'low',
  none: '',
};

function cellClass(c: HeatCell | undefined): string {
  return c ? `heat-cell ${STATUS_CLASS[c.status]}`.trim() : 'heat-cell none-none';
}

/** 解析 `YYYY-MM-DD`（本地时间，防 UTC 偏移）。非法返回 null。 */
function parseDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

const WEEKDAY_HEAD = ['一', '二', '三', '四', '五', '六', '日'];

/** 本地日期串 YYYY-MM-DD。 */
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 续火热力图：
 *   主视图 = 近 30 天（3 行 × 10 列）；
 *   「查看完整日历」= 屏幕正中的标准月历弹窗（‹ › 切换月份，每月天数自动正确）。
 */
export function HeatCalendar({ heatmap }: HeatCalendarProps) {
  const [showModal, setShowModal] = useState(false);
  /** 弹窗当前查看的月份（当月 1 号）。 */
  const [viewDate, setViewDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const hasMore = heatmap.length > MAIN_DAYS;

  // 主视图：取最近 30 天，不足补空位；按时间升序铺成 3 行 10 列
  const recent = heatmap.slice(-MAIN_DAYS);
  const mainCells: (HeatCell | null)[] = [
    ...recent,
    ...Array.from({ length: MAIN_DAYS - recent.length }, (): null => null),
  ];
  const mainRows = [
    mainCells.slice(0, 10),
    mainCells.slice(10, 20),
    mainCells.slice(20, 30),
  ];

  // 弹窗：date → 状态 快查表
  const heatByDate = useMemo(
    () => new Map(heatmap.map((c) => [c.date, c])),
    [heatmap],
  );

  // 月历参数：该月天数、首日偏移（周一对齐）、今天
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate(); // 28/29/30/31 自动正确
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // 周一=0
  const todayStr = fmt(new Date());

  const monthCells: (number | null)[] = [
    ...Array.from({ length: lead }, (): null => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (monthCells.length % 7 !== 0) monthCells.push(null);

  const shiftMonth = (delta: number) =>
    setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <GlassCard span={12}>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span>
          <span>🗓️</span> 续火热力图{' '}
          <span style={{ fontSize: 12, color: 'var(--txt-faint)', fontWeight: 400 }}>
            近 30 天 · 已续 {heatmap.filter((c) => c.status === 'done').length} 天
          </span>
        </span>
        {hasMore && (
          <button className="btn btn-mini" onClick={() => setShowModal(true)}>
            查看完整日历
          </button>
        )}
      </div>

      {/* 主视图：3 行 × 10 列 */}
      <div className="heat-main">
        {mainRows.map((row, ri) => (
          <div className="heat-main-row" key={ri}>
            {row.map((c, ci) =>
              c ? (
                <div key={c.date} className={cellClass(c)} title={`${c.date} · ${STATUS_LABEL[c.status]}`} />
              ) : (
                <div key={`empty-${ri}-${ci}`} className="heat-cell ghost" />
              ),
            )}
          </div>
        ))}
      </div>

      <div className="heat-legend">
        <span>
          <i style={{ background: 'rgba(255,255,255,.07)' }} />
          未发
        </span>
        <span>
          <i style={{ background: 'linear-gradient(135deg,rgba(255,138,61,.5),rgba(255,93,115,.4))' }} />
          断更
        </span>
        <span>
          <i style={{ background: 'linear-gradient(135deg,#ff8a3d,#ff5d73)' }} />
          已续
        </span>
      </div>

      {/* 二级界面：屏幕正中的标准月历（Portal 到 body —— 避免 .glass 的 backdrop-filter
          改变 fixed 定位基准导致遮罩只盖住卡片、弹窗偏下）。点遮罩 / × / 关闭按钮均可关。 */}
      {showModal &&
        createPortal(
          <div className="cal-modal-mask" onClick={() => setShowModal(false)}>
            <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cal-head">
                <button className="cal-nav" onClick={() => shiftMonth(-1)} title="上一个月">
                  ‹
                </button>
                <div className="cal-title">
                  {year} 年 {month + 1} 月
                </div>
                <button className="cal-nav" onClick={() => shiftMonth(1)} title="下一个月">
                  ›
                </button>
              </div>

              <div className="cal-grid">
                {WEEKDAY_HEAD.map((w) => (
                  <div key={w} className="cal-wd">
                    {w}
                  </div>
                ))}
                {monthCells.map((day, i) => {
                  if (day === null) return <div key={`pad-${i}`} className="cal-day empty" />;
                  const dateStr = fmt(new Date(year, month, day));
                  const cell = heatByDate.get(dateStr);
                  const isToday = dateStr === todayStr;
                  return (
                    <div
                      key={dateStr}
                      className={[
                        'cal-day',
                        cell ? `has ${STATUS_CLASS[cell.status]}` : '',
                        isToday ? 'today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={cell ? `${dateStr} · ${STATUS_LABEL[cell.status]}` : dateStr}
                    >
                      <span>{day}</span>
                    </div>
                  );
                })}
              </div>

              <div className="heat-legend" style={{ marginTop: 14 }}>
                <span>
                  <i style={{ background: 'rgba(255,255,255,.07)' }} />
                  未发
                </span>
                <span>
                  <i style={{ background: 'linear-gradient(135deg,rgba(255,138,61,.5),rgba(255,93,115,.4))' }} />
                  断更
                </span>
                <span>
                  <i style={{ background: 'linear-gradient(135deg,#ff8a3d,#ff5d73)' }} />
                  已续
                </span>
              </div>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button className="btn" onClick={() => setShowModal(false)}>
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </GlassCard>
  );
}
