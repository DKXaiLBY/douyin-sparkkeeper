import clsx from 'clsx';
import type { ReactNode } from 'react';

/** 设置页的一个分类 Tab。 */
export interface SettingsTabDef {
  /** Tab 唯一 id，与 SettingsPage 里的面板一一对应。 */
  id: string;
  /** Tab 文案。 */
  label: string;
  /** Tab 图标（emoji）。 */
  icon: string;
}

interface SettingsTabsProps {
  tabs: readonly SettingsTabDef[];
  /** 当前选中的 tab id。 */
  active: string;
  onChange: (id: string) => void;
}

/**
 * 设置页二级 Tab 条：胶囊状选中态（橙渐变），未选中为淡灰，窄屏可横向滚动。
 * 只负责「选中哪个」的展示与回调，不含任何面板逻辑。
 */
export function SettingsTabs({ tabs, active, onChange }: SettingsTabsProps) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="设置分类">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={clsx('settings-tab', on && 'on')}
            onClick={() => onChange(tab.id)}
          >
            <span className="settings-tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

interface SettingsPaneProps {
  /** 是否为当前选中的面板。false 时仅视觉隐藏，不卸载。 */
  active: boolean;
  children: ReactNode;
}

/**
 * 设置页 Tab 面板容器。
 *
 * ⚠️ 必须用 display:none 隐藏而**不能**条件渲染（{active && children}）：
 * 1. CredentialPanel 卸载会触发 useEffect cleanup → api.credentials.qrCancel()，
 *    正在进行的扫码会被后端直接掐掉浏览器；
 * 2. 扫码状态（qrState / 轮询中）、加密口令输入框内容、文案草稿等内部 state
 *    都存在组件里，卸载即丢，切走再切回就白扫了。
 * 因此所有面板始终挂载，只切换可见性。
 */
export function SettingsPane({ active, children }: SettingsPaneProps) {
  return (
    <div
      className="settings-pane"
      role="tabpanel"
      hidden={!active}
      style={active ? undefined : { display: 'none' }}
    >
      {children}
    </div>
  );
}
