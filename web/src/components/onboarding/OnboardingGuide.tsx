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
 * 首次引导：扫码登录 → 添加好友 → 完成。
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
            desc: '点下方按钮进入「设置」，在「凭证保险库」里点「扫码登录」，用抖音 App 扫一下。\n登录凭证只加密存在你自己电脑上，不上传任何服务器。',
            action: '去扫码登录',
            target: 'settings' as const,
          },
        ]),
    ...(hasFriends
      ? []
      : [
          {
            title: '添加要守护的好友',
            desc: '回到「仪表盘」，在「火花好友」里点「＋ 添加」，填昵称和对方在抖音会话里显示的名字。\n建议先加 1 位，跑通了再加其他人。',
            action: '去添加好友',
            target: 'dashboard' as const,
          },
        ]),
    {
      title: '完成！🎉',
      desc: '之后每天 20:00 左右会自动给好友发一条消息续火花。\n你只需要：偶尔回仪表盘看一眼，收到异常提醒时处理一下。',
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
