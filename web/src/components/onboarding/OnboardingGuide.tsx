import { useState } from 'react';

interface OnboardingGuideProps {
  /** 是否已扫码登录（凭证已导入）。已完成的步骤会被跳过。 */
  hasCredential: boolean;
  /** 是否已添加过好友。已完成的步骤会被跳过。 */
  hasFriends: boolean;
  /** 切换页面（引导步骤会引导用户去对应页面操作）。 */
  onTab: (t: 'dashboard' | 'settings') => void;
  /** 完成/跳过引导：落盘，之后不再出现。 */
  onDone: () => void;
  /** 临时关闭遮罩（不落盘）：点「去操作」时用——跳转是引导的终点，不能把用户挡在遮罩后面。 */
  onSnooze: () => void;
}

interface GuideStep {
  title: string;
  desc: string;
  action: string;
  /** 点击主按钮要跳转的目标页；null 表示不跳转、直接结束引导。 */
  target: 'dashboard' | 'settings' | null;
}

/**
 * 首次引导：扫码登录 → 添加好友 → 完成（含使用与配置要点）。
 *
 * 两条硬规则：
 * 1. 已完成的步骤会被跳过（按 hasCredential / hasFriends 生成步骤列表）；
 * 2. 点「去扫码登录 / 去添加好友」必须同时关闭遮罩，否则用户被挡住，根本点不到目标页的按钮。
 */
export function OnboardingGuide({
  hasCredential,
  hasFriends,
  onTab,
  onDone,
  onSnooze,
}: OnboardingGuideProps) {
  const [step, setStep] = useState(0);

  const steps: GuideStep[] = [
    ...(hasCredential
      ? []
      : [
          {
            title: '扫码登录',
            desc: '点下方按钮进入「设置 → 凭证保险库」，点「扫码登录」用抖音 App 扫一下。\n登录凭证只加密存在你自己电脑上，不上传任何服务器。\n如果没设过口令，扫码时填的口令就是你的保险库口令——记住它，忘了无法找回。',
            action: '去扫码登录',
            target: 'settings' as const,
          },
        ]),
    ...(hasFriends
      ? []
      : [
          {
            title: '添加要守护的好友',
            desc: '回到「仪表盘」，在「火花好友」里点「＋ 添加」。\n可以直接手填，或点「从抖音拉取好友」一键勾选你的会话列表。\n建议先加 1 位，跑通了再加其他人。',
            action: '去添加好友',
            target: 'dashboard' as const,
          },
        ]),
    {
      title: '完成！🎉 接下来它会自己跑',
      desc: '之后每天会在你设置的错峰时段（默认 19–23 点）内随机挑一个时刻，自动给好友发一条消息续火花——不固定时间，行为更像真人。\n\n日常你只需要三件事：\n1️⃣ 偶尔回仪表盘看看「今日待续」和热力图\n2️⃣ 顶部铃铛响了去处理（掉线 / 验证码 / 发送失败）\n3️⃣ 想调节奏去「设置」：安全模式（发送上限/时段）、通知渠道、发送文案',
      action: '开始使用',
      target: null,
    },
  ];

  // 步骤列表按配置状态动态生成，索引可能越界（如配置在打开期间变为已完成），兜底到最后一步。
  const s = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  const handleAction = (): void => {
    if (s.target) {
      onTab(s.target);
      onSnooze(); // 跳转即关闭遮罩，让用户真的能操作目标页
      return;
    }
    onDone();
  };

  return (
    <div className="ob-mask">
      <div className="ob-card">
        <div className="ob-steps">
          {steps.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--txt-faint)', marginBottom: 10 }}>
          {step + 1} / {steps.length} · 火花守护 SparkKeeper
        </div>
        <h2 className="ob-title">{s.title}</h2>
        <p className="ob-desc" style={{ whiteSpace: 'pre-line' }}>
          {s.desc}
        </p>

        <div className="ob-actions">
          {/* 上一步：误点「下一步」也能回头，不用重新清 localStorage 才能重看 */}
          {step > 0 && (
            <button className="ob-skip" onClick={() => setStep((v) => Math.max(0, v - 1))}>
              上一步
            </button>
          )}
          <button className="ob-skip" onClick={onDone}>
            跳过引导
          </button>
          {!isLast && (
            <button className="btn" onClick={() => setStep((v) => v + 1)}>
              下一步
            </button>
          )}
          <button className="btn btn-primary" onClick={handleAction}>
            {s.action}
          </button>
        </div>
      </div>
    </div>
  );
}
