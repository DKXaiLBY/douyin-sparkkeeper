import { useState } from 'react';
import { useConfig } from '@/hooks/useConfig.ts';
import { useDashboard } from '@/hooks/useDashboard.ts';
import type { HealthStatus } from '@/api/types.ts';
import { EngineControl } from '@/components/settings/EngineControl.tsx';
import { CredentialPanel } from '@/components/settings/CredentialPanel.tsx';
import { SafetyPanel } from '@/components/settings/SafetyPanel.tsx';
import { TemplatePanel } from '@/components/settings/TemplatePanel.tsx';
import { NotifyPanel } from '@/components/settings/NotifyPanel.tsx';
import { SettingsTabs, SettingsPane } from '@/components/settings/SettingsTabs.tsx';
import type { SettingsTabDef } from '@/components/settings/SettingsTabs.tsx';

interface SettingsPageProps {
  health: HealthStatus | null;
  onHealthChange: () => void;
  /** 点设置页底部「重新查看引导」：由 App 清掉完成标记并强制重弹首次引导。 */
  onReplayOnboard: () => void;
}

/**
 * 设置页分类（一次只显示一类，避免 5 个面板平铺造成的臃肿）。
 * 平台适配器面板已移除：只支持抖音，切平台属低频操作，通过 .env 的 PLATFORM 配置即可。
 */
const SETTINGS_TABS: readonly SettingsTabDef[] = [
  { id: 'engine', label: '引擎', icon: '⚙️' },
  { id: 'account', label: '账号', icon: '🔐' },
  { id: 'safety', label: '安全', icon: '🛡️' },
  { id: 'notify', label: '通知', icon: '🔔' },
  { id: 'template', label: '文案', icon: '✍️' },
];

/** 默认落在「账号」：新用户第一件事就是扫码登录，不该先看到一堆开关。 */
const DEFAULT_TAB = 'account';

/** 设置页：分类 Tab 界面，一次只显示一类设置。 */
export function SettingsPage({
  health,
  onHealthChange,
  onReplayOnboard,
}: SettingsPageProps) {
  const { config, loading, update } = useConfig();
  const { refresh } = useDashboard();
  const [tab, setTab] = useState<string>(DEFAULT_TAB);

  if (loading || !config) {
    return <div style={{ color: 'var(--txt-dim)' }}>加载中…</div>;
  }

  return (
    <div>
      <SettingsTabs tabs={SETTINGS_TABS} active={tab} onChange={setTab} />

      {/* 所有面板常驻挂载，只靠 display:none 切换可见性 —— 详见 SettingsPane 注释。
          各面板的 props 与内部逻辑一律不动。 */}
      <SettingsPane active={tab === 'engine'}>
        <EngineControl health={health} onHealthChange={onHealthChange} onDashboardChange={refresh} />
      </SettingsPane>

      <SettingsPane active={tab === 'account'}>
        <CredentialPanel />
      </SettingsPane>

      <SettingsPane active={tab === 'safety'}>
        <SafetyPanel config={config} update={update} />
      </SettingsPane>

      <SettingsPane active={tab === 'notify'}>
        <NotifyPanel config={config} update={update} />
      </SettingsPane>

      <SettingsPane active={tab === 'template'}>
        <TemplatePanel config={config} update={update} />
      </SettingsPane>

      {/* 「重新查看引导」放在 Tab 条**外面**：不管用户正停在哪个分类都能一眼看到，
          不用去猜它藏在「引擎」还是「账号」里。引导只在首次自动弹一次，
          之前想重看只能手动清 localStorage，这个入口把那步操作收进界面。 */}
      <div className="settings-footer">
        <span className="settings-footer-tip">错过了首次引导？</span>
        <button type="button" className="settings-footer-link" onClick={onReplayOnboard}>
          ↻ 重新查看引导
        </button>
      </div>
    </div>
  );
}
