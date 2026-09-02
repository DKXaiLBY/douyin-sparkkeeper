import { useState } from 'react';
import { useDashboard } from '@/hooks/useDashboard.ts';
import { api } from '@/api/client.ts';
import { Overview } from '@/components/dashboard/Overview.tsx';
import { TodoList } from '@/components/dashboard/TodoList.tsx';
import { FriendGrid } from '@/components/dashboard/FriendGrid.tsx';
import { HeatCalendar } from '@/components/dashboard/HeatCalendar.tsx';

/**
 * 仪表盘页：
 *   今日待续（主角，整行置顶）
 *   今日概览（5）  | 火花好友（7）
 *   续火热力图（12，整行；点「查看完整日历」弹屏幕正中月历）
 * 成功率已上移到顶部栏（Header 常驻显示），原独立圆环卡片按用户要求移除。
 */
export function DashboardPage() {
  const { data, loading, error, refresh } = useDashboard();
  /**
   * 发送失败提示（页面内展示，替代 alert —— alert 在部分内嵌预览环境会被拦截，
   * 用户会误以为按钮「点了没反应」）。
   * ⚠️ 必须声明在所有条件 return 之前：hooks 顺序不能因 loading/数据状态变化，
   *    否则 React 报「Rendered fewer hooks than expected」整树崩溃（黑屏）。
   */
  const [sendErr, setSendErr] = useState('');

  if (loading) return <div style={{ color: 'var(--txt-dim)' }}>加载中…</div>;
  if (error) return <div style={{ color: '#ff5d73' }}>加载失败：{error}</div>;
  if (!data) return null;

  /** 给指定好友补发一条（后端 /run/now 支持 body.friendId 定向发送）。 */
  const onSend = async (friendId: string) => {
    setSendErr('');
    try {
      await api.run.now(friendId);
      await refresh();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : '发送失败');
    }
  };

  /** 一键给所有待续好友发送（后端按安全策略限速，不会瞬间全发）。 */
  const onSendAll = async () => {
    setSendErr('');
    try {
      await api.run.now();
      await refresh();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : '发送失败');
    }
  };

  return (
    <div className="grid-12">
      {sendErr && (
        <div
          className="span12"
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            background: 'rgba(255,93,115,.14)',
            border: '1px solid rgba(255,93,115,.4)',
            color: '#ffc2cc',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>⚠️ 发送失败：{sendErr}</span>
          <button
            onClick={() => setSendErr('')}
            style={{
              border: 'none',
              background: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'inherit',
              flex: 'none',
            }}
          >
            ×
          </button>
        </div>
      )}
      <TodoList
        due={data.dueToday}
        totalFriends={data.friends.length}
        onSend={onSend}
        onSendAll={onSendAll}
      />
      <Overview
        protectedCount={data.protectedCount}
        sentToday={data.sentToday}
        longestStreak={data.longestStreak}
      />
      <FriendGrid friends={data.friends} onFriendsChange={refresh} />
      <HeatCalendar heatmap={data.heatmap} />
    </div>
  );
}
