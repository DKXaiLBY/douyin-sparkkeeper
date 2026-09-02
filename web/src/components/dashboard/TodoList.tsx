import { GlassCard } from '@/components/layout/GlassCard.tsx';
import { useCountUp } from '@/hooks/useCountUp.ts';
import { formatHours } from '@/lib/format.ts';
import type { DueItem } from '@/api/types.ts';

interface TodoListProps {
  due: DueItem[];
  /** 好友总数：为 0 时显示空状态引导，而不是一个空的待办列表。 */
  totalFriends: number;
  /** 给指定好友补发一条。 */
  onSend?: (friendId: string) => void;
  /** 一键给所有待续好友发送。 */
  onSendAll?: () => void;
}

/**
 * 今日待续（仪表盘主角，整行置顶）。
 * 顶部大数字 = 还没续上的好友数；全部续完显示完成态，不显示刺眼的 0。
 */
export function TodoList({ due, totalFriends, onSend, onSendAll }: TodoListProps) {
  const pending = due.filter((d) => !d.done);
  const done = due.filter((d) => d.done);
  // 未完成的排前面，已续的排在后面（视觉降级，不喧宾夺主）。
  const ordered = [...pending, ...done];
  const heroNum = useCountUp(pending.length);

  return (
    <GlassCard span={12}>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span>
          <span>🎯</span> 今日待续
        </span>
        {pending.length > 0 && (
          <button className="btn btn-primary" onClick={() => onSendAll?.()}>
            全部发送
          </button>
        )}
      </div>

      {totalFriends === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">✨</div>
          <div className="empty-title">还没有守护的火花</div>
          <div className="empty-desc">
            第一步：去「设置」→「凭证保险库」扫码登录。
            <br />
            第二步：回到仪表盘，在「火花好友」里点「＋ 添加」，把要守护的人加进来。
          </div>
        </div>
      ) : (
        <>
          <div className="todo-hero">
            <span className="todo-hero-num">{heroNum}</span>
            <span className="todo-hero-unit">位好友待续</span>
            {done.length > 0 && (
              <span className="todo-hero-done">已续 {done.length} 位</span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="todo-done">✨ 今天已全部续上，明天见</div>
          ) : (
            <div className="todo">
              {ordered.map((d) => (
                <div className={d.done ? 'todo-row is-done' : 'todo-row'} key={d.friendId}>
                  <div className="avatar">{d.nickname.slice(0, 1)}</div>
                  <div className="who">
                    <b>{d.nickname}</b>
                    <s>{d.done ? '今日已续' : `距熄灭 ${formatHours(d.hoursToExpire)}`}</s>
                  </div>
                  <button
                    className={d.done ? 'btn btn-done' : 'btn'}
                    disabled={d.done}
                    onClick={() => onSend?.(d.friendId)}
                  >
                    {d.done ? '已发' : '去发'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
