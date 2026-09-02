import { useState } from 'react';
import { GlassCard } from '@/components/layout/GlassCard.tsx';
import { LEVEL_COLOR } from '@/lib/theme.ts';
import { api } from '@/api/client.ts';
import type { Friend } from '@/api/types.ts';

interface FriendGridProps {
  friends: Friend[];
  onFriendsChange: () => void;
}

/** 超过这个数量就折叠，只显示前若干位，避免面板被撑得过长。 */
const COLLAPSE_AFTER = 6;

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  marginBottom: 8,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)',
  color: 'inherit',
  fontSize: 13,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.22)',
  background: 'rgba(255,255,255,.12)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
};

/** 火花好友列表（行式）：展示 + 添加/删除，超过 6 位可展开。 */
export function FriendGrid({ friends, onFriendsChange }: FriendGridProps) {
  const [showForm, setShowForm] = useState(false);
  const [nickname, setNickname] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);

  // ---- 好友自动提取：登录后从抖音会话列表拉取候选好友，勾选即添加 ----
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');

  const visible = showAll ? friends : friends.slice(0, COLLAPSE_AFTER);

  /** 已存在的好友名（按 platformId 去重），拉取列表时自动排除/标记。 */
  const existingIds = new Set(friends.map((f) => f.platformId));

  const discover = async () => {
    setDiscoverLoading(true);
    setBatchMsg('');
    try {
      const r = await api.friends.discover();
      const items = r.items.filter((t) => !existingIds.has(t));
      if (items.length === 0) {
        setBatchMsg('抖音会话列表里没有找到新的好友（可能都已添加）');
        setDiscovered([]);
        return;
      }
      setDiscovered(items);
      setSelected(new Set(items)); // 默认全选，用户可取消
    } catch (e) {
      const m = e instanceof Error ? e.message : '拉取失败';
      setBatchMsg(`❌ ${m}`);
      setDiscovered([]);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  /** 批量添加勾选的好友（昵称与 platformId 都用会话名）。 */
  const addSelected = async () => {
    const names = [...selected];
    if (names.length === 0) {
      setBatchMsg('请先勾选要添加的好友');
      return;
    }
    setBatchBusy(true);
    setBatchMsg('');
    let ok = 0;
    const failed: string[] = [];
    for (const name of names) {
      try {
        await api.friends.add({ nickname: name, platformId: name });
        ok += 1;
      } catch {
        failed.push(name);
      }
    }
    setSelected(new Set());
    setDiscovered([]);
    setBatchMsg(
      failed.length
        ? `✅ 成功 ${ok} 位；❌ 失败 ${failed.length} 位（${failed.join('、')}），可稍后重试`
        : `✅ 已添加 ${ok} 位好友`,
    );
    setBatchBusy(false);
    onFriendsChange();
  };

  const add = async () => {
    if (!nickname.trim() || !platformId.trim()) {
      setMsg('昵称和 platformId 都必填');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await api.friends.add({
        nickname: nickname.trim(),
        platformId: platformId.trim(),
        ...(remark.trim() ? { remark: remark.trim() } : {}),
      });
      setNickname('');
      setPlatformId('');
      setRemark('');
      setShowForm(false);
      onFriendsChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '添加失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: Friend) => {
    if (!window.confirm(`确定删除好友「${f.nickname}」吗？（发送历史记录会保留）`)) return;
    try {
      await api.friends.remove(f.id);
      onFriendsChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <GlassCard span={7}>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span>
          <span>✨</span> 火花好友
        </span>
        <button
          style={{ ...btnStyle, padding: '3px 10px', lineHeight: 1.2 }}
          onClick={() => setShowForm((v) => !v)}
          title="添加好友"
        >
          {showForm ? '收起' : '＋ 添加'}
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.06)' }}>
          {/* 自动提取：登录后从抖音会话列表拉取，勾选即添加（杜绝手打名字打错人） */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <button style={btnStyle} disabled={discoverLoading} onClick={discover}>
              {discoverLoading ? '拉取中…' : '🔄 从抖音拉取好友'}
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--txt-faint)' }}>
              需先扫码登录；未登录会提示
            </span>
          </div>

          {discovered.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                padding: 10,
                borderRadius: 10,
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.1)',
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              {discovered.map((name) => (
                <label
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    padding: '4px 2px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(name)}
                    onChange={() => toggleSelect(name)}
                    style={{ accentColor: '#ff8a3d' }}
                  />
                  {name}
                  {existingIds.has(name) && (
                    <span style={{ fontSize: 11, color: 'var(--txt-faint)' }}>（已添加）</span>
                  )}
                </label>
              ))}
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', fontSize: 12.5 }}
                  disabled={batchBusy || selected.size === 0}
                  onClick={addSelected}
                >
                  {batchBusy
                    ? '添加中…'
                    : `批量添加（已选 ${selected.size} 位）`}
                </button>
              </div>
            </div>
          )}
          {batchMsg && (
            <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginBottom: 10 }}>{batchMsg}</div>
          )}

          <input
            style={inputStyle}
            placeholder="昵称（自己起，用于展示）"
            value={nickname}
            maxLength={64}
            onChange={(e) => setNickname(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="platformId：对方在抖音会话列表里显示的名字"
            value={platformId}
            maxLength={64}
            onChange={(e) => setPlatformId(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="备注（可选）"
            value={remark}
            maxLength={64}
            onChange={(e) => setRemark(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btnStyle} disabled={busy} onClick={add}>
              {busy ? '添加中…' : '确认添加'}
            </button>
            {msg && <span style={{ color: '#ff5d73', fontSize: 12 }}>{msg}</span>}
          </div>
        </div>
      )}

      <div className="friend-list">
        {visible.map((f) => (
          <div className="friend-row" key={f.id}>
            <div className="friend-avatar">{f.nickname.slice(0, 1)}</div>
            <div className="friend-who">
              <b>{f.nickname}</b>
              <s>
                {f.streakDays} 天 · {f.level}
                {f.remark ? ` · ${f.remark}` : ''}
              </s>
            </div>
            <div className="friend-days">
              {f.streakDays}
              <em>天</em>
            </div>
            <span
              className="chip"
              style={{ color: LEVEL_COLOR[f.level] ?? '#fff', flex: 'none' }}
            >
              {f.level}
            </span>
            <button
              onClick={() => remove(f)}
              title={`删除 ${f.nickname}`}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'rgba(255,255,255,.42)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                flex: 'none',
                padding: '2px 4px',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {friends.length > COLLAPSE_AFTER && (
        <button
          className="btn"
          style={{ width: '100%', marginTop: 10 }}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? '收起' : `展开全部 ${friends.length} 位好友`}
        </button>
      )}
    </GlassCard>
  );
}
