import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header.tsx';
import { DashboardPage } from '@/pages/DashboardPage.tsx';
import { SettingsPage } from '@/pages/SettingsPage.tsx';
import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide.tsx';
import { ConsentGate } from '@/components/consent/ConsentGate.tsx';
import { api } from '@/api/client.ts';
import type { HealthStatus } from '@/api/types.ts';

type Tab = 'dashboard' | 'settings';

/** 引导完成标记（localStorage）：用户主动「完成 / 跳过」后落盘。 */
const ONBOARD_KEY = 'sparkkeeper-onboarded';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  /** health 首次拉取是否结束（未结束前不判断引导，避免已配置用户首屏闪一下引导）。 */
  const [healthLoaded, setHealthLoaded] = useState(false);
  /** 用户主动完成/跳过引导 → 落盘，之后不再出现。 */
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARD_KEY) === '1',
  );
  /** 点「去操作」只临时关闭遮罩（不落盘），下次刷新按最新配置状态重新判断。 */
  const [snoozed, setSnoozed] = useState(false);
  /**
   * 用户主动点「重新查看引导」→ 强制显示一次。
   *
   * 为什么不能只清 localStorage 标记：showOnboard 还有 `!configured` 这一条，
   * 已经配好凭证和好友的老用户清了标记也照样不弹，等于按钮点了没反应。
   * 所以除了清标记，还要用这个一次性开关绕过 configured 判断，保证「点了就一定出现」。
   */
  const [onboardForced, setOnboardForced] = useState(false);

  const finishOnboard = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setOnboarded(true);
    setSnoozed(false);
    setOnboardForced(false); // 强制标记是一次性的：引导结束后立即失效，不影响后续正常使用
  }, []);

  const snoozeOnboard = useCallback(() => {
    setSnoozed(true);
    setOnboardForced(false);
  }, []);

  /**
   * 设置页「重新查看引导」：清掉完成标记 + 置上强制开关，立刻重新弹引导。
   * snoozed 也要清，否则上一次「去操作」留下的临时关闭会盖掉这次请求。
   */
  const replayOnboard = useCallback(() => {
    localStorage.removeItem(ONBOARD_KEY);
    setOnboarded(false);
    setSnoozed(false);
    setOnboardForced(true);
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
    } catch {
      /* 后端未起时静默：保留上一次的 health，别让界面反复横跳 */
    } finally {
      setHealthLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const t = setInterval(() => void loadHealth(), 15_000);
    return () => clearInterval(t);
  }, [loadHealth]);

  // 配置状态：有凭证 + 有好友即视为已配置好，不再打扰。
  const hasCredential = health?.credentialImported ?? false;
  const hasFriends = (health?.friends ?? 0) > 0;
  const configured = hasCredential && hasFriends;

  // 强制开关优先：它绕开 onboarded / configured 两个判断，确保「重新查看引导」一定弹得出来。
  const showOnboard =
    healthLoaded && !snoozed && (onboardForced || (!onboarded && !configured));

  return (
    <ConsentGate>
      <div className="app-bg" />
      <div className="orb a" />
      <div className="orb b" />
      <div className="orb c" />
      <div className="wrap">
        <Header health={health} tab={tab} onTab={setTab} />
        {tab === 'dashboard' ? (
          <DashboardPage />
        ) : (
          <SettingsPage
            health={health}
            onHealthChange={loadHealth}
            onReplayOnboard={replayOnboard}
          />
        )}
      </div>
      {showOnboard && (
        <OnboardingGuide
          hasCredential={hasCredential}
          hasFriends={hasFriends}
          onTab={setTab}
          onDone={finishOnboard}
          onSnooze={snoozeOnboard}
        />
      )}
    </ConsentGate>
  );
}
