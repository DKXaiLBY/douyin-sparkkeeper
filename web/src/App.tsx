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

  const finishOnboard = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setOnboarded(true);
    setSnoozed(false);
  }, []);

  const snoozeOnboard = useCallback(() => {
    setSnoozed(true);
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

  const showOnboard = healthLoaded && !onboarded && !snoozed && !configured;

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
          <SettingsPage health={health} onHealthChange={loadHealth} />
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
