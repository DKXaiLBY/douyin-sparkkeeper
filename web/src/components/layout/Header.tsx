import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { StatusPill } from './StatusPill.tsx';
import { todayLabel } from '@/lib/format.ts';
import { api } from '@/api/client.ts';
import type { HealthStatus, Notification } from '@/api/types.ts';

interface HeaderProps {
  health: HealthStatus | null;
  tab: 'dashboard' | 'settings';
  onTab: (t: 'dashboard' | 'settings') => void;
}

/** 单条通知的类型图标。 */
function notifIcon(type: string): string {
  if (type === 'captcha') return '🧩';
  if (type === 'login_expired') return '🔑';
  if (type === 'send_failed') return '❌';
  if (type === 'daily_summary') return '📋';
  return '🔔';
}

/** 顶部品牌栏 + 引擎状态 + 通知中心 + 导航。 */
export function Header({ health, tab, onTab }: HeaderProps) {
  const engineState: 'ok' | 'off' | 'bad' = health?.paused
    ? 'off'
    : health?.credentialImported || health?.platform === 'mock'
      ? 'ok'
      : 'bad';

  // ---- 通知中心：30 秒拉一次最近通知，铃铛显示未读数 ----
  const [notifs, setNotifs] = useState<Notification[] | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  /** 通知下拉容器引用：用于「点击面板外部自动关闭」。 */
  const notifRef = useRef<HTMLDivElement | null>(null);
  const unread = notifs?.filter((n) => !n.read).length ?? 0;

  // 点击下拉面板以外的任何地方 → 自动收起通知（此前必须再点一次铃铛才能关）
  useEffect(() => {
    if (!notifOpen) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [notifOpen]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const list = await api.notifications.list(30);
        if (!stopped) setNotifs(list.items);
      } catch {
        /* 后端未起时静默 */
      }
    };
    void load();
    const t = window.setInterval(load, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, []);

  // ---- 30 天成功率：顶部栏常驻显示（和通知同节奏 30 秒刷新一次） ----
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const d = await api.dashboard();
        if (!stopped) setRate(d.successRate30d);
      } catch {
        /* 后端未起时静默 */
      }
    };
    void load();
    const t = window.setInterval(load, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, []);

  const markAllRead = async () => {
    try {
      await api.notifications.readAll();
      setNotifs((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    } catch {
      /* 静默 */
    }
  };

  return (
    <header className="flex items-center justify-between flex-wrap gap-4 mb-5">
      <div className="flex items-center gap-3">
        <div
          className="w-13 h-13 rounded-2xl grid place-items-center text-2xl"
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'linear-gradient(145deg,#ff8a3d,#ff5d73)',
            boxShadow: '0 8px 24px rgba(255,93,115,.45), inset 0 1px 0 rgba(255,255,255,.4)',
          }}
        >
          🔥
        </div>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: 0.5 }}>火花守护</h1>
          <p style={{ color: 'var(--txt-dim)', fontSize: 13, marginTop: 2 }}>
            SparkKeeper · 抖音火花自动守护
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill
          label={health?.paused ? '已暂停（接管中）' : '引擎在线'}
          state={engineState}
        />
        {/* 「抖音模式/演练模式」胶囊已移除：只支持抖音，该状态恒为抖音，没有信息量 */}
        <span className="pill" style={{ color: 'var(--txt-dim)' }}>{todayLabel()}</span>

        {/* 30 天守护成功率：常驻顶部栏（原独立圆环卡片已按用户要求砍掉） */}
        {rate !== null && (
          <span
            title="近 30 天发送成功率"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              color: '#ffd479',
              background: 'rgba(255,138,61,.12)',
              border: '1px solid rgba(255,138,61,.32)',
              whiteSpace: 'nowrap',
            }}
          >
            🔥 成功率 {Math.round(rate * 100)}%
          </span>
        )}

        {/* 通知中心：异常（验证码/登录过期/发送失败）与每日日报都在这里 */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="btn"
            style={{ position: 'relative' }}
            onClick={() => setNotifOpen((v) => !v)}
            title="通知"
          >
            🔔
            {unread > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 999,
                  background: 'linear-gradient(135deg,#ff8a3d,#ff5d73)',
                  color: '#fff',
                  fontSize: 10.5,
                  fontWeight: 600,
                  display: 'grid',
                  placeItems: 'center',
                  padding: '0 4px',
                  boxShadow: '0 2px 8px rgba(255,93,115,.5)',
                }}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                width: 330,
                maxHeight: 420,
                overflowY: 'auto',
                zIndex: 50,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,.16)',
                background: 'rgba(26,19,25,.97)',
                backdropFilter: 'blur(24px) saturate(150%)',
                boxShadow: '0 18px 50px rgba(0,0,0,.5)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 16px',
                  borderBottom: '1px solid rgba(255,255,255,.1)',
                  position: 'sticky',
                  top: 0,
                  background: 'rgba(26,19,25,.97)',
                }}
              >
                <b style={{ fontSize: 13 }}>通知</b>
                {unread > 0 && (
                  <button
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--ember-2,#ffb454)',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    onClick={markAllRead}
                  >
                    全部标为已读
                  </button>
                )}
              </div>

              {!notifs || notifs.length === 0 ? (
                <div style={{ padding: '30px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-faint)', lineHeight: 1.8 }}>
                  🔔 暂无通知
                  <br />
                  出现验证码、登录过期、发送失败时会在这里提醒你
                </div>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      borderLeft: n.read ? 'none' : '2px solid #ff8a3d',
                      opacity: n.read ? 0.62 : 1,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 500, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{notifIcon(n.type)}</span>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 4, lineHeight: 1.6 }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: 'var(--txt-faint)', marginTop: 5 }}>
                      {new Date(n.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <nav className="flex gap-2">
          <button
            className={clsx('btn', tab === 'dashboard' && 'btn-primary')}
            onClick={() => onTab('dashboard')}
          >
            仪表盘
          </button>
          <button
            className={clsx('btn', tab === 'settings' && 'btn-primary')}
            onClick={() => onTab('settings')}
          >
            设置
          </button>
        </nav>
      </div>
    </header>
  );
}
