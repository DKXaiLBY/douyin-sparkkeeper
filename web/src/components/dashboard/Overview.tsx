import { GlassCard } from '@/components/layout/GlassCard.tsx';
import { useCountUp } from '@/hooks/useCountUp.ts';

interface OverviewProps {
  protectedCount: number;
  sentToday: number;
  longestStreak: number;
}

/** 今日概览：守护中 / 今日已续 / 最长连续。数字带滚动动效，0 显示「—」避免负面观感。 */
export function Overview({ protectedCount, sentToday, longestStreak }: OverviewProps) {
  const nProtected = useCountUp(protectedCount);
  const nSent = useCountUp(sentToday);
  const nStreak = useCountUp(longestStreak);

  return (
    <GlassCard span={5}>
      <div className="section-title">
        <span>📊</span> 今日概览
      </div>
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{nProtected}</div>
          <div className="l">守护中</div>
        </div>
        <div className="stat">
          <div className="n">{nSent > 0 ? nSent : '—'}</div>
          <div className="l">今日已续</div>
        </div>
        <div className="stat">
          <div className="n">{nStreak > 0 ? nStreak : '—'}</div>
          <div className="l">最长连续</div>
        </div>
      </div>
    </GlassCard>
  );
}
