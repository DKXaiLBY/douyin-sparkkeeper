# 火花守护 SparkKeeper · UI 升级方案（交接文档）

> 本文档自包含，可直接交给任何 AI / 开发者执行。
> 项目路径：`D:\claude-workspace\2026-08-22-23-24-06\douyin-streak\`

---

## 0. 项目背景（先读）

「抖音火花守护 SparkKeeper」是一个**自托管 Web 应用**：每天定时用 Playwright 驱动抖音网页版，给好友自动发一条私信维持"火花"标识。核心卖点：**本地优先、数据只存本机、网页自动化（不逆向）、可视化看板**。

### 架构

```
后端（server/src/）：Node + Express + TypeScript（ESM！相对导入必须带 .ts 后缀）
  ├─ routes/        路由层（/api/...）
  ├─ scheduler/     定时发送任务（sendJob.ts）
  ├─ platforms/     平台适配器（PlatformAdapter 接口 + DouyinWebAdapter + MockAdapter）
  ├─ services/      扫码登录等（qrLoginService.ts）
  └─ config/        配置（schema.ts / loader.ts）

前端（web/src/）：React 18 + Vite 5 + TypeScript，路径别名 @/ 指向 web/src/
  ├─ components/dashboard/  仪表盘组件（Overview / SuccessRing / TodoList / FriendGrid / HeatCalendar / DraftPreview / SparkStarMap）
  ├─ components/settings/   设置页面板（EngineControl / CredentialPanel / SafetyPanel / NotifyPanel / TemplatePanel / AutoStartPanel）
  ├─ components/onboarding/ 首次引导（OnboardingGuide）
  ├─ components/layout/     GlassCard / GlassPanel / Header / StatusPill
  ├─ pages/                 DashboardPage / SettingsPage
  ├─ lib/                   glass.css（全局设计系统）、format.ts、theme.ts
  └─ api/                   client.ts / types.ts

根目录测试：vitest（tests/ 下 6 个文件 33 项）
```

### 运行 / 验证命令（执行每个任务后必须跑）

```bash
# 项目根目录执行
cd douyin-streak

# 类型检查（必须 0 错误）
(cd web && npx tsc --noEmit)
(cd server && npx tsc --noEmit)

# 全量测试（必须全过，当前 33/33）
npx vitest run

# 前端开发服务（看 UI）
npm run dev:web     # http://localhost:5173
npm run dev:server  # 后端 :3000
```

---

## 1. 绝对不要踩的坑（前人已踩过，严禁重复）

| 坑 | 说明 |
|---|---|
| **ESM 导入后缀** | server/src/ 内相对导入**必须**写 `import ... from './xxx.ts'`（带 `.ts`），否则 tsc 报错 |
| **SVG 的 title** | React 里 `<svg title="...">` 不支持，会报 TS2322；必须用子元素 `<title>内容</title>` |
| **路径别名** | web/src/ 内用 `@/components/...`，**不要**写相对路径 `../../components/` |
| **`.glass` 有 overflow:hidden** | 在玻璃面板里做"向上弹出"的 tooltip 会被裁掉；tooltip 必须**向下弹**或放在面板外 |
| **localStorage 时机** | 写 localStorage 不要在"勾选时"假设有值，要在"输入时"持久化（曾导致记住口令失效） |
| **api.notifications.list 返回值** | 是 `{ items, unread }` 不是数组，直接 setState(list) 会类型报错 |
| **safe-delete** | 沙箱删目录用 genie-trash 可能失败，清理临时目录允许报错不中断 |
| **测试端口** | 实测后端别用 3000/5173（会冲突），用 PORT=39xx + DATA_DIR=./data-tx 临时目录 |

---

## 2. 任务总览

| 优先级 | 任务 | 涉及文件 | 预期效果 |
|---|---|---|---|
| **P0-1** | 修复引导逻辑错误 | OnboardingGuide.tsx, App.tsx, DashboardPage.tsx | 已配置用户不弹；点"去操作"遮罩关闭 |
| **P0-2** | 修复毛玻璃失效 | lib/glass.css | 卡片透出暖色柔光，玻璃感显现 |
| **P0-3** | 日历改近 14 天 + 展开 | HeatCalendar.tsx | 默认紧凑 14 天，可展开看 30 天 |
| **P1-1** | 液态玻璃质感升级 | lib/glass.css | 渐变边框 + 高光 + 层次 |
| **P1-2** | 今日待续主角化 | TodoList.tsx | 大数字 + 待办 + 一键发送 + 完成态 |
| **P1-3** | 微动效 | lib/glass.css + 组件 | 卡片进场、数字滚动、按钮按压 |
| **P2-1** | 统计卡正向表达 | Overview.tsx | "待续 X 位"替代"0 已续" |
| **P2-2** | 开机自启并入引擎控制 | EngineControl.tsx, SettingsPage.tsx, 删 AutoStartPanel.tsx | 设置页 2×2 整齐 |
| **P2-3** | 空状态引导 | DashboardPage.tsx / TodoList.tsx | 没好友时显示引导卡 |

**执行顺序**：严格按 P0 → P1 → P2。每完成一项跑验证命令（见 §0）。

---

## 3. P0-1 修复引导逻辑错误（最高优先级）

### 现状的两个真 bug

**文件**：`web/src/components/onboarding/OnboardingGuide.tsx`、`web/src/App.tsx`

**Bug 1 —— 跳转后遮罩不关闭**
- 现状（OnboardingGuide.tsx）：第 1 步按钮 `go: () => onTab('settings')`，只切换 tab，**引导遮罩 `.ob-mask` 还覆盖在屏幕上**，用户根本没法点设置页去扫码。
- 修复：点"去操作"（扫码/添加好友）时，**同时关闭引导遮罩**（视为完成引导，或标记"稍后再看"）。跳转是引导的终点，不是继续留在遮罩里。

**Bug 2 —— 已配置好的用户也弹引导**
- 现状（App.tsx 第 15 行附近）：`showOnboard = localStorage.getItem('sparkkeeper-onboarded') !== '1'`——只要没点过完成，**即使已经扫过码、加过好友**也会弹引导，让用户再做一遍。
- 修复：把**配置状态**传给引导组件，按状态决定显示哪一步/是否显示。

### 修复方案（详细）

**改 App.tsx**（管理引导状态 + 传配置）：

```tsx
// App.tsx 需要 health.credentialImported 和好友数。
// health 已有（loadHealth）；好友数需要拉一次 dashboard 或 friends。

// 引导显示逻辑（伪代码）：
const hasCredential = health?.credentialImported ?? false;
const hasFriends = friends.length > 0;  // 需要 fetch /api/friends 或 dashboard

// 三态：
//   全部配置好（hasCredential && hasFriends）→ 不显示引导
//   部分配置 → 显示引导，但跳过已完成的步骤
//   完全没配 → 从第 1 步开始
```

**改 OnboardingGuide.tsx**（接收配置 + 关闭遮罩逻辑）：

```tsx
interface OnboardingGuideProps {
  hasCredential: boolean;      // 是否已扫码登录
  hasFriends: boolean;         // 是否已添加好友
  onTab: (t: 'dashboard' | 'settings') => void;
  onDone: () => void;          // 完成/跳过（存 localStorage）
  onSnooze: () => void;        // 稍后再看（关闭但不存 localStorage）
}

// 步骤生成（跳过已完成的）：
const steps = [
  ...(hasCredential ? [] : [扫码步骤]),
  ...(hasFriends ? [] : [添加好友步骤]),
  完成步骤,
];

// 点"去操作"按钮：onTab(目标页) + onDone()（关闭遮罩）
// 即：跳转即视为引导结束（用户接下来在目标页操作），不要再留遮罩。
```

**验证**：
1. 清空 localStorage → 首次打开应看到引导第 1 步
2. 点「去扫码登录」→ 遮罩应关闭、跳到设置页、可正常点扫码
3. 已扫码 + 已加好友（`localStorage` 删掉 onboard 标记）→ 刷新应**不弹**引导
4. 只扫了码没加好友 → 刷新应只弹"添加好友"这一步

---

## 4. P0-2 修复毛玻璃失效

### 根因（已定位）

`web/src/lib/glass.css` 第 29-40 行：三个背景光球 `.orb.a/.orb.b/.orb.c` 全在屏幕**四角**（左上 / 右上 / 底部）。卡片在屏幕**中央**，卡片正下方是**纯黑背景**——`backdrop-filter: blur(40px)` 模糊的是黑色，所以看不出任何玻璃感。

```
现状：          修复后：
  ●a      ●b      a↑
        [卡]    ●b→ [卡] ←b   （光球挪到卡片后方）
      ●c        c↑
```

### 修复（改 glass.css 第 29-41 行）

```css
/* 把光球挪到卡片区域后方（屏幕中央偏上/偏下），让卡片背面有色彩可模糊 */
.orb.a {
  width: 480px; height: 480px;
  left: 8%; top: 6%;
  background: radial-gradient(circle, rgba(255,138,61,.5), transparent 66%);
}
.orb.b {
  width: 420px; height: 420px;
  right: 10%; top: 34%;
  background: radial-gradient(circle, rgba(255,93,115,.42), transparent 66%);
  animation-delay: -6s;
}
.orb.c {
  width: 380px; height: 380px;
  left: 38%; bottom: 8%;
  background: radial-gradient(circle, rgba(255,180,84,.36), transparent 66%);
  animation-delay: -11s;
}
/* 注意：光球颜色从纯色改半透明（rgba 0.4~0.5），避免过于刺眼盖过内容 */
```

同时把卡片背景调得更通透（`--glass-bg` 第 10 行附近），让模糊的色彩透出来：

```css
--glass-bg: linear-gradient(135deg, rgba(255, 235, 220, 0.08), rgba(255, 255, 255, 0.02));
```

**验证**：刷新仪表盘，卡片边缘应能看到透出的暖色柔光（不再是一块死黑）。截图对比前后。

---

## 5. P0-3 日历改近 14 天 + 展开

### 现状问题

`HeatCalendar.tsx`（第 15-23 行）：渲染全部近 30 天格子，数据少时几乎全是空格（深色块），占地方且难看。

### 修复

```tsx
// HeatCalendar.tsx 改造：
const [expanded, setExpanded] = useState(false);
const shown = expanded ? heatmap : heatmap.slice(-14);   // 默认近 14 天

// 渲染 shown；右侧加「展开全部 / 收起」按钮（heatmap.length > 14 时显示）
// 格子可以调小一点（CSS .heat-cell 尺寸），让 14 天一行排得下
```

**验证**：数据少时默认只见 14 个格子；点「展开全部」显示全部 30 天；再点「收起」回到 14 天。

---

## 6. P1-1 液态玻璃质感升级（做对了就"眼前一亮"）

在 P0-2 修复的基础上，再叠三层，让玻璃真正"透"：

### 6.1 渐变边框（镜面反射感）

给 `.glass`（glass.css 第 44 行附近）加**渐变边框**：

```css
.glass {
  position: relative;
  background: var(--glass-bg);
  backdrop-filter: blur(40px) saturate(170%);
  -webkit-backdrop-filter: blur(40px) saturate(170%);
  border: 1px solid var(--glass-stroke);
  border-radius: var(--r);
  box-shadow: 0 18px 50px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.28);
  overflow: hidden;
}
/* 新增：渐变边框高光（像 iOS 镜面） */
.glass::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(160deg, rgba(255,255,255,.32), transparent 38%, transparent 72%, rgba(255,138,61,.14));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
}
```

> 注意：`.glass::before` 已被用于顶部高光（第 54 行附近），渐变边框用 `::after`，别冲突。

### 6.2 色彩层次（不只是橙色）

整体配色加入琥珀、玫瑰、金的层次（光球已调），让背景柔光有变化，不是单一橙色。

### 6.3 验证

卡片应有：透出的暖色柔光 + 顶部镜面高光 + 边缘渐变边框，一眼是"玻璃"不是"色块"。

---

## 7. P1-2 今日待续主角化

### 现状

`TodoList.tsx`：只是普通卡片，和其他卡片平级，不突出。

### 改造（重写 TodoList.tsx，span 改 12 置顶）

```tsx
// 顶部大数字：X 位好友待续
// 下方待办列表（头像 + 昵称 + 距熄灭 X 小时 + 去发按钮）
// 全部完成时：显示「✨ 今天已全部续上」
// 右上角加「全部发送」主按钮（调用 api.run.now()）

// 参考结构：
<GlassCard span={12}>
  <div className="section-title">🎯 今日待续</div>
  <div className="todo-hero">
    <span className="todo-hero-num">{pendingCount}</span>
    <span className="todo-hero-unit">位好友待续</span>
  </div>
  {pendingCount === 0 ? (
    <div className="todo-done">✨ 今天已全部续上，明天见</div>
  ) : (
    <div className="todo">...待办行...</div>
  )}
</GlassCard>
```

CSS（加进 glass.css）：

```css
.todo-hero { display: flex; align-items: baseline; gap: 10px; margin: 6px 0 16px; }
.todo-hero-num {
  font-size: 56px; font-weight: 250; letter-spacing: -2px; line-height: 1;
  background: linear-gradient(135deg, #ffd479, #ff8a3d);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.todo-hero-unit { font-size: 15px; color: var(--txt-dim); }
.todo-done { font-size: 15px; color: #5ddba4; padding: 10px 0; }
```

**验证**：有待办时顶部大数字醒目；全部发完显示"今天已全部续上"。

---

## 8. P1-3 微动效（克制但点睛）

### 8.1 卡片错落进场

glass.css 加：

```css
@keyframes card-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
.glass-card { animation: card-in 0.55s var(--ease) both; }
/* 仪表片子元素依次延迟 */
.grid-12 > *:nth-child(1) { animation-delay: 0.00s; }
.grid-12 > *:nth-child(2) { animation-delay: 0.05s; }
.grid-12 > *:nth-child(3) { animation-delay: 0.10s; }
.grid-12 > *:nth-child(4) { animation-delay: 0.15s; }
.grid-12 > *:nth-child(5) { animation-delay: 0.20s; }
.grid-12 > *:nth-child(6) { animation-delay: 0.25s; }
```

### 8.2 数字滚动（可选，加分）

用一个小 hook（`useCountUp`）让统计数字从 0 滚到目标值（0.8s，ease-out）。不加库，约 20 行。

### 8.3 按钮按压

`.btn:active { transform: scale(0.96); }`（加进 glass.css）

### 8.4 减少动画打扰

```css
@media (prefers-reduced-motion: reduce) {
  .glass-card, .star, * { animation: none !important; transition: none !important; }
}
```

---

## 9. P2 收尾

### 9.1 统计卡正向表达（Overview.tsx）

`sentToday` 为 0 时显示"0"很负面。改为：为 0 显示 "—"，并把标签改成"待续"。或者重新组织为「守护中 X · 待续 Y · 最长连续 Z」。

```tsx
// Overview.tsx 第 21-24 行附近：
<div className="stat">
  <div className="n">{sentToday > 0 ? sentToday : '—'}</div>
  <div className="l">今日已续</div>
</div>
```

### 9.2 开机自启并入引擎控制（EngineControl.tsx + SettingsPage.tsx）

- 把 `AutoStartPanel` 的开关逻辑搬进 `EngineControl.tsx`（作为第四个按钮/开关，放在暂停/恢复旁边）
- 删除 `web/src/components/settings/AutoStartPanel.tsx`
- `SettingsPage.tsx` 移除 AutoStartPanel 引用，布局调整为：
  ```
  引擎控制（整行，含开机自启）
  凭证保险库 | 安全模式
  通知推送   | 发送文案
  ```
  （`TemplatePanel` 移到与 `NotifyPanel` 同行的 span6；现在是 span12 发送文案单独一行也可以，但让 2×2 更整齐）

> 注意：AutoStartPanel 内部用了 `api.settings.autostart()` 和 `api.settings.setAutostart()`，接口保留，只是 UI 合并。

### 9.3 空状态引导（可选）

`TodoList` 或 `FriendGrid` 在 friends.length === 0 时，显示引导卡（"还没有守护的火花 → 添加第一位好友"）。

---

## 10. 交付标准（Definition of Done）

全部完成后必须满足：

- [ ] `web` 与 `server` 各自 `npx tsc --noEmit` **0 错误**
- [ ] 根目录 `npx vitest run` **33/33 全过**（不破坏现有测试；如新增组件可补测试）
- [ ] 引导逻辑 4 个验证点全过（§3 末尾）
- [ ] 仪表盘卡片透出暖色柔光（毛玻璃可见）
- [ ] 日历默认 14 天、可展开 30 天
- [ ] 今日待续置顶大数字、全部完成态正常
- [ ] 设置页 2×2 整齐、无半行空缺、无独立开机自启面板
- [ ] 刷新后刷新无 console 报错、无 React key 警告

---

## 11. 不要做（明确排除）

- ❌ 不要重新加回"火花星图"（用户已明确删除：SparkStarMap.tsx 应同时从 DashboardPage 移除引用并删文件）
- ❌ 不要加"平台适配器"面板（用户已明确删除，只支持抖音）
- ❌ 不要改后端 ESM 导入风格（保持 `.ts` 后缀）
- ❌ 不要引入新的 UI 框架/库（保持原生 CSS + React，零 UI 库依赖）
- ❌ 不要把"手动导入 storage_state"加回凭证面板（用户已明确删除）
- ❌ 不要在 tooltip 用"向上弹出"（会被 glass 的 overflow 裁掉）

---

## 12. 顺带要做（和 UI 无关但必须）

**移除 SparkStarMap**（用户已否决星图）：
1. `DashboardPage.tsx` 删除 `import { SparkStarMap }` 和 `<SparkStarMap .../>` 引用
2. 删除 `web/src/components/dashboard/SparkStarMap.tsx`
3. glass.css 里 `.star-map`/`.star`/`.star-wrap`/`.star-label`/`.sm-bg`/`.sm-empty`/`@keyframes star-twinkle` 相关样式可一并删（不删也无害，但留着是死代码）

---

**执行提示**：本方案的所有改动都在**前端**（web/src/），后端只保留现有接口。DeepSeek 执行时，每完成一节就跑 §0 的验证命令，遇到问题先查 §1 的坑表。
