# 抖音火花守护 SparkKeeper —— 封号风险 & 配置简化 调研报告

- 调研人：许清楚（产品经理）
- 调研日期：2026-08-30
- 调研方式：WebSearch + WebFetch 真实检索（GitHub issues / discussions / README / docs / 技术社区）
- 调研边界：**只调研，不写代码**
- 声明：**本报告所有结论均附来源 URL。凡未检索到的，一律写明"未检索到"，不做推断性编造。**

---

## 目录

1. [封号风险：真实证据清单](#一封号风险真实证据清单)
2. [风控实践：行业做法汇总](#二风控实践行业做法汇总)
3. [headless / 浏览器模式专项结论](#三headless--浏览器模式专项结论)
4. [配置简化：竞品做法 + 可落地建议](#四配置简化竞品做法--可落地建议)
5. [结论与提醒](#五结论与提醒)
6. [附录：本次检索的缺口](#六附录本次检索的缺口)

---

## 一、封号风险：真实证据清单

### 1.1 一句话结论（先给答案）

> **在本次检索覆盖的全部公开信息中，未检索到任何一条"因为跑抖音续火花脚本而被封号 / 被禁止私信 / 被禁言"的真实用户报告。**
>
> 真实发生、且被多个项目反复报告的后果只有三类：**① 掉登录（cookie / storage_state 失效）② 弹验证码（安全验证）③ 消息发不出去（页面/接口挂了）**。

**但必须同时说清楚三点保留意见：**

1. 这些项目普遍只活跃了几个月（DouYinSparkFlow 59 commits、douyin-auto-spark 自 2026-06 起、douyin-auto-fire 自 2026-08 起），**样本量小、观察期短**，"没检索到封号" ≠ "不会封号"。
2. 2026 年抖音刚下线了"创作者中心私信入口"，主战场刚迁到 `douyin.com/chat`，**风控策略正在变动期**（DouYinSparkFlow 作者原话："目前 `https://www.douyin.com/chat` 没经过长期测试"）。
3. 下面是事实，不是安慰：**所有竞品 README 都写了"可能限流/封禁"的免责声明**，且都把使用边界限定在"个人自用 + 少量好友 + 每天一条"。

---

### 1.2 来自竞品仓库的一手证据（可信度高）

> 以下每条都是真实打开 issue / README 页面摘出来的原文。

#### 🔴 证据 1：作者本人在 README 自曝"GitHub Actions 被抖音检测到踢下线"

- **来源**：https://github.com/2061360308/DouYinSparkFlow （README 顶部置顶提示）
- **原文**：
  > "反馈Github Action部署会被抖音检测到踢下线，暂时不确定消息可靠性。但已增加Docker部署方式，有条件的可以使用自己服务器部署。"
- **可信度**：**高**。作者自述，写进 README 置顶。但作者自己也留了"暂时不确定消息可靠性"的口子。
- **结论**：有"被检测 + 踢下线"的反馈，但后果是**掉登录**，不是封号。

---

#### 🔴 证据 2：Issue #77 —— 服务器 Docker 部署，"网页端被自动登出"（最直接的一条）

- **来源**：https://github.com/2061360308/DouYinSparkFlow/issues/77 （2026-08-30，Open，3 条评论）
- **用户原文**：
  > "但是我在手机端查看，并没有成功发出。再回到提取cookie的chrome，发现被登出了"
  >
  > "我怀疑是抖音平台的 cookie 校验增强了，本地和服务器 IP，设备指纹 啥的不匹配。"
- **用户给出的解法**：
  > "解决方案就是需要在服务器上扫描登录，目前你的解决方法就是在服务器创建个代理，然后本地浏览器连上后再登录，这样获取的 cookie 就没问题了，比如说用vnc连接浏览器，取 cookie。"
- **作者回复**：
  > "我用的在分支上正在开发的的那一版，直接在服务器上扫码登录现在一直没啥问题"
- **可信度**：**高**。完整的排障过程 + 作者确认。
- **结论**：真实发生了"被登出"。根因被指向 **IP + 设备指纹不一致**，而不是 headless、也不是发消息本身。**全程无人提到封号。**

---

#### 🔴 证据 3：Issue #59 —— 作者本人总结"抖音登录加入了更严格的机器人和浏览器环境校验"

- **来源**：https://github.com/2061360308/DouYinSparkFlow/issues/59 （2026-08-24 关闭）
- **作者 2061360308 原话（这是本次调研里信息量最大的一段）**：
  > "1. 抖音登录加入了更严格的机器人和浏览器环境校验，无法通过简单复制cookie实现自动登录，
  > 2. 其次作者本人并不承担法律风险去逆向抖音接口
  > 3. 最后GitHub环境近些时日不稳定，有关Action执行环境也有区分于用户电脑的明显特征"
- **同帖用户反应**："我正好刚刚deploy。。 刚配置完手动执行不了 看到这个天塌了"
- **可信度**：**高**。仓库所有者本人，且是复盘性总结。
- **结论**：抖音确实在加严**登录环节**的机器人/环境校验。**注意：这是"登录校验"，不是"发消息处罚"。**

---

#### 🔴 证据 4：Issue #34 —— 有人明确反馈"运行没一周就会弹验证码"

- **来源**：https://github.com/2061360308/DouYinSparkFlow/issues/34 （标题："抖音是不是给制裁了"）
- **用户 bling-yshs 原话**：
  > "`https://www.douyin.com/chat` 在GitHub Action 中打开这个网页不会偶尔触发验证码操作吗？我之前也想迁移到这里但是运行没一周就会弹验证码了，成功率都不如创作者中心"
- **作者 2061360308 原话**：
  > "因为卡ip,登陆用哪个ip后续都需要用。"
- **用户 bling-yshs 后续**：
  > "我最近在测试http的接口，结果也开始刷不出来了，我感觉应该是被风控了😮‍💨"
- **可信度**：**高**（多人在帖内互相印证）。
- **结论**：**这是唯一一条明确"运行不到一周就弹验证码"的时间量化反馈**，且发生在 GitHub Actions 环境。作者归因于 **IP 一致性**。

---

#### 🔴 证据 5：Issue #58 —— "一个 cookie 只能在一台设备上使用"

- **来源**：https://github.com/2061360308/DouYinSparkFlow/issues/58 （2026-08-24 关闭）
- **用户原话**：
  > "现在抖音官方限制了一个cookies只能在一台设备上使用，也就是说你的github action在部署好之后最多只能跑通一次"
- **可信度**：**中**。（单条用户断言，作者未确认，用户也未给出官方出处；但与 #77 的"IP/指纹不匹配被登出"现象高度吻合，可交叉印证。）
- **结论**：若属实，直接否掉"本机导出 cookie → 服务器复用"这条路线。与证据 2 互相印证。

---

#### 🔴 证据 6：竞品 douyin-auto-spark Issue #28 —— "每运行一次 GitHub Action，Cookie 就会失效"

- **来源**：https://github.com/bling-yshs/douyin-auto-spark/issues/28 （Open，13 条评论）
- **用户 ayangweb 原话**：
  > "每运行一次 GitHub Action，Cookie 就会失效，导致在浏览器中打开抖音时登录状态也会失效，需要重新登录。目前观察到的情况是：执行成功的任务没有发送消息，而执行失败的任务基本都是因为 Cookie 失效导致的。"
- **其他用户**："可能是风控原因，我的账号也出现过类似问题"
- **作者 bling-yshs**："你看楼上那些有遇到风控的问题，如果遇到那我没招了。我是暂时没遇到"
- **可信度**：**高**（有截图，多人在场讨论，作者参与）。
- **结论**：又是 **cookie 失效**，且是"跑一次就失效"。**依然没有人说封号。**

---

#### 🔴 证据 7：douyin-auto-fire Issue #13 —— "抖音网页版很容易自动退登"

- **来源**：https://github.com/unmev/douyin-auto-fire/issues/13 （2026-08-27 关闭）
- **用户原话**：
  > "github actions那个cookie登录方式受浏览器抖音状态的影响，而且抖音网页版很容易自动退登导致cookie失效很麻烦"
- **作者回复**："目前没有 只能通过cookie来登录"
- **可信度**：**高**。

---

#### 🟡 证据 8：douyin-auto-fire README 官方风险提示（原文）

- **来源**：https://github.com/unmev/douyin-auto-fire
- **原文（"⚠️ 注意事项"章节）**：
  > "- GitHub-hosted Runner 或云服务器网络环境可能触发抖音安全验证。
  > - 如果 Cookie / Storage State 失效或抖音要求验证码，需要本人重新完成登录验证。"
- **可信度**：**高**（作者写的）。
- **结论**：**作者列出的风险上限是"触发安全验证"，不是封号。**

---

#### 🟡 证据 9：用户在 Linux.do 自述（作者本人）

- **来源**：https://linux.do/t/topic/2757825
- **原话**：
  > "另外 GitHub Actions 的 IP 偶尔也可能触发验证，这个没办法硬绕，Cookie 失效就重新登一下更新｡"
- **可信度**：**中-高**（社区帖，作者自述）。

---

#### 🟡 证据 10：Gitee 同类项目（与 SparkKeeper 定位几乎一模一样）的合规声明

- **来源**：https://gitee.com/jin-hui1688/douyin-spark （"抖音续火花助手 Douyin Spark Keeper"）
- **原文**：
  > "⚠️ 仅限本人账号、少量好友、每天一条的**个人自用**场景。自动化发私信违反抖音社区公约，存在被风控、限流甚至封号的风险，使用后果自负。请勿用于批量营销、对外提供服务。"
  >
  > "本项目违反抖音社区公约中'未经平台允许采用自动化手段发私信'的规定，账号可能被限流或封禁。"
- **可信度**：**中-高**（同类项目作者的判断）。
- **对我们有用的一点**：这个项目和 SparkKeeper 定位完全一致（自托管 + Web UI + 每天一条 + Playwright），**它的风险声明措辞可以直接参考**。

---

#### 🟡 证据 11：DouYinSparkFlow 免责声明原文

- **来源**：https://github.com/2061360308/DouYinSparkFlow （README "⚠️ 免责声明"）
- **原文**：
  > "2. 使用本脚本产生的一切风险（包括但不限于抖音账号限流、封禁、处罚等）均由使用者自行承担，项目开发者不承担任何责任。
  > 4. 请合理控制脚本运行频率，避免给抖音平台服务器造成压力，建议仅用于个人少量好友的火花维系。"

#### 🟡 证据 12：DouYinSparkFlow 公益服（Discussion #76）免责

- **来源**：https://github.com/2061360308/DouYinSparkFlow/discussions/76
- **原文**：
  > "登录后账户凭证会保存在服务器，若使用请自行评估风险，此外可用性不做任何承诺"
  >
  > "请勿向他人提供账号密码、短信验证码或抖音登录凭证，并合理控制任务数量与发送频率。"

#### 🟢 证据 13：cookie 会过期（多个项目一致口径）

- DouYinSparkFlow #40：https://github.com/2061360308/DouYinSparkFlow/issues/40
  > "cookie是会过期的，所以用一段时间可以会出现卡在登陆界面的问题，解决方法就是重新生成cookie"
- douyin-cloud-streak：https://github.com/15467-lab/douyin-cloud-streak
  > "登录态（`state.json`）通常几天到几周会过期"
- eric1981/douyin-monitor：https://github.com/eric1981/douyin-monitor
  > "抖音 Web 端 Cookie 有效期通常约 **7~30 天**"

---

### 1.3 关于"抖音对自动化私信的具体处罚方式"（第三方信息，可信度需要打折）

> ⚠️ **本节全部来自营销/SEO 内容站或无一手出处的文章，没有一条能追溯到抖音官方公开文件。请按"坊间口径"看待，不要直接写进 PRD 当事实。**

| 说法 | 来源 | 可信度 | 备注 |
|---|---|---|---|
| "机器化特征行为（脚本定时群发，IP/设备指纹/操作节奏高度一致）已纳入'净网行动'重点打击，**封禁率超 91%**"；"累计 2 次处罚即**冻结私信功能 30 天**，第 3 次**关闭账号私信入口**" | https://geo.newrank.cn/news/8045 （新榜，自称引用"抖音 2024 年 Q1《违规处置公示报告》"） | **低-中** | 引用了报告名和精确百分比，但**未提供报告原文链接，无法核实**；且描述的是"批量群发营销"，与"每天给固定好友发 1 条"差别极大 |
| 阶梯处罚：轻度 = 弹窗警告、限流、**限制私信 1~7 天**；中度 = **封禁私信功能 30~90 天**；重度 = **永久封禁全功能**，同设备/同手机号/同 IP 小号连带 | http://www.hfab.cn/canyinguanli/4161.html | **低** | 内容农场站，无一手来源、无作者、无日期佐证 |
| "1 分钟发超 5 条就会被风控盯上"；"新号每天不超 20 条、老号不超 100 条"；"封号概率是新号 6 倍" | https://www.yunduoketang.com/study/bot23827.html | **低** | 卖课/卖工具营销文，数字无出处 |
| "使用该类工具的抖音账号，大概率触发风控，出现**私信受限、限流、永久封号**等处罚"；"官方私信接口准入仅限企业蓝 V 账号，**个人抖音号没有官方授权接入通道**" | https://developer.cloud.tencent.com.cn/article/2682151 | **中** | 云厂商技术社区，但仍是软文导向；"个人号无官方接口"这一条与所有竞品都走浏览器自动化的事实吻合，可作为旁证 |

**未检索到**：抖音官方公开规则/处罚公示中，针对"**个人账号 · 每天 1 条 · 发给固定互关好友**"这一具体场景的处罚条款原文。**这一条请架构师/法务不要假设，也不要对外声称有。**

---

### 1.4 风险结论（给主理人的一句话版）

| 风险类型 | 是否有真实证据 | 严重程度 | 对我们的影响 |
|---|---|---|---|
| **封号 / 永久封禁** | ❌ 未检索到（0 条真实报告） | 未知 | 不能排除，但当前无任何案例 |
| **禁止私信功能 / 禁言** | ❌ 未检索到（0 条真实报告） | 未知 | 同上 |
| **限流 / 降权** | ❌ 未检索到（仅免责声明中提及） | 未知 | 同上 |
| **弹验证码 / 安全验证** | ✅ 有（DouYinSparkFlow #34：运行不到一周就弹） | **中** | 会中断任务，需要人工介入 |
| **掉登录 / cookie 失效** | ✅ 有大量（#77 / #58 / #59 / #28 / #13 / #40） | **高（最痛）** | **这是真正的高频故障，比封号更影响体验** |
| **消息发不出去（页面/接口失效）** | ✅ 有（DouYinSparkFlow #28、#34：`imapi.snssdk.com/v2/message/get_by_user_init` 接口报错；创作者中心私信入口下线 #59/#61） | **高** | 平台一改版就整体失效 |

---

## 二、风控实践：行业做法汇总

> 说明：下表每一条都标注了**具体是哪个项目这么做**以及**原文 / 具体参数**，可直接抄作业。

### 2.1 节奏类（延迟、频率、时段）

| 做法 | 谁这么做 | 具体参数 / 原文 | 来源 |
|---|---|---|---|
| **好友之间随机间隔 3~8 秒** | douyin-auto-fire | config.json：`"send_interval_seconds": {"min": 3, "max": 8}` | https://github.com/unmev/douyin-auto-fire/blob/main/docs/server.md |
| **随机输入节奏（打字速度拟人）** | douyin-auto-fire | README 特性："⏱️ 模拟真人操作：支持随机发送间隔和输入节奏" | https://github.com/unmev/douyin-auto-fire |
| **随机浮动时间窗口（不是每天准点）** | Yuriz132/douyin-cloud-streak | "随机浮动时间：如 `30` 分钟（系统会在 20:30~21:30 之间随机挑选时间发送，模拟真人行为）" | https://github.com/Yuriz132/douyin-cloud-streak |
| **随机时间窗口 + 随机文案 + 好友间随机间隔（三件套）** | Gitee douyin-spark | "节奏拟人化：发送时间有随机抖动窗口、好友之间有随机间隔、文案从模板库随机选择" | https://gitee.com/jin-hui1688/douyin-spark |
| **错峰：不同账号分配不同时间，每 5~10 分钟一个号** | Gitee douyin-spark | "给不同号分配不同 `schedule_time`（如每 5~10 分钟一个号），让发送均匀分布在数小时内" | 同上 |
| **时段选在白天活跃时段** | Yuriz132/douyin-cloud-streak | "建议勾选 20 人以内，时间选在**白天活跃时段**（如 09:00、12:00、21:00）"；默认 21:00 | 同上 |
| **默认发送时间 08:00** | douyin-auto-fire | systemd `OnCalendar=*-*-* 08:00:00` | https://github.com/unmev/douyin-auto-fire/blob/main/docs/server.md |
| **一天只跑一次** | 全部项目 | DouYinSparkFlow `.env.example`：`CRON_HOUR=9` | https://github.com/2061360308/DouYinSparkFlow/blob/main/.env.example |

### 2.2 内容与数量类

| 做法 | 谁这么做 | 具体参数 / 原文 | 来源 |
|---|---|---|---|
| **随机消息（多条候选随机选）** | douyin-auto-fire | "🎲 随机消息：支持从多条候选消息中随机选择" | README |
| **随机一言库** | douyin-auto-spark / DouYinSparkFlow | douyin-auto-spark 从 `assets/yiyan.json` 随机挑；DouYinSparkFlow 用一言 API + 类型池（`HITOKOTO_TYPES`） | https://github.com/bling-yshs/douyin-auto-spark ； https://github.com/2061360308/DouYinSparkFlow/blob/main/.env.example |
| **单账号好友数 ≤ 20** | Yuriz132/douyin-cloud-streak | "建议单账号每日不超过 20 人" | https://github.com/Yuriz132/douyin-cloud-streak |
| **少量好友（几个到十几个）最稳** | Gitee douyin-spark | FAQ："提示操作频繁：调大'好友间隔'、减少每次发送人数；**少量好友（几个到十几个）最稳**" | https://gitee.com/jin-hui1688/douyin-spark |
| **用备注名定位好友，不用昵称** | douyin-auto-spark | "💡 建议填备注名而不是昵称……好友一旦改昵称就会搜不到，火花随之中断" | https://github.com/bling-yshs/douyin-auto-spark |

### 2.3 执行架构类

| 做法 | 谁这么做 | 具体参数 / 原文 | 来源 |
|---|---|---|---|
| **全局串行队列，同一时刻只有一个浏览器** | Gitee douyin-spark | "串行错峰发送：全局串行队列保证同一时刻只有一个浏览器在跑，配合每号独立定时 + 随机抖动……**降低同 IP 风控**" | https://gitee.com/jin-hui1688/douyin-spark |
| **并发上限 5 个浏览器会话，超出排队** | Yuriz132/douyin-cloud-streak | "全局并发限制（最多 5 个浏览器会话）……超出自动排队，防风控"（`MAX_CONCURRENT_BROWSERS`） | https://github.com/Yuriz132/douyin-cloud-streak |
| **一个账号不并发跑多个任务** | douyin-auto-fire | "同一个抖音账号不要同时运行多个自动发送任务，避免重复发送" | README 注意事项 |
| **限流熔断：识别"操作频繁/安全验证"立即停本轮** | Gitee douyin-spark | "限流检测：识别'操作频繁 / 安全验证'提示，命中立即停止本轮，避免误发" | https://gitee.com/jin-hui1688/douyin-spark |
| **发送结果校验 + 失败重试 1 次** | Gitee douyin-spark | "真实发送校验：文字进入输入框 → 按 Enter → 文字离开输入框，三步都满足才算成功；失败自动重试一次" | 同上 |
| **当日只对失败好友补发一次** | Gitee douyin-spark | "约 45 分钟后自动只对失败好友补发一次（每天最多一次）" | 同上 |
| **整轮失败才重试，发过任意一条就不重试（防重复发）** | 15467-lab/douyin-cloud-streak | `MAX_ATTEMPTS = 3`、`RETRY_GAP = 120`；"只要发出过任意一条就停止重试，**不会重复发消息**" | https://github.com/15467-lab/douyin-cloud-streak |
| **任务重试次数可配** | DouYinSparkFlow | `.env`：`TASK_RETRY_TIMES=3` | https://github.com/2061360308/DouYinSparkFlow/blob/main/.env.example |
| **Action 内默认重试 2 次** | douyin-auto-spark | PR #29 "默认重试2次" | https://github.com/bling-yshs/douyin-auto-spark/issues/28 |
| **防重复发送（发送历史）** | douyin-auto-fire | "🔒 防重复发送：支持记录发送历史，减少重复触发导致的重复发送" | README |
| **防错发：切人后校验会话标题** | Gitee douyin-spark | "切换校验：点击联系人后，必须确认右侧会话顶部标题出现目标昵称，才继续发送，杜绝'发给上一个人'" | https://gitee.com/jin-hui1688/douyin-spark |
| **防错发：严格精确匹配（避免 test 匹配到 test1）** | douyin-auto-fire | commit："保留好友严格精确匹配……保证 test 永远不会匹配 test1 或 test(7)" | https://github.com/unmev/douyin-auto-fire |
| **失败留证据（日志 + 截图 + Trace）** | douyin-auto-fire | "🛡️ 失败诊断：失败时可保存日志、页面截图和 Playwright Trace" | README |

### 2.4 IP / 环境类（**这一类是被反复强调的，优先级最高**）

| 做法 | 谁这么做 | 具体参数 / 原文 | 来源 |
|---|---|---|---|
| **登录 IP 与运行 IP 必须一致（卡 IP）** | DouYinSparkFlow 作者 | Issue #34："因为**卡ip,登陆用哪个ip后续都需要用**。" | https://github.com/2061360308/DouYinSparkFlow/issues/34 |
| **服务器选同城国内节点，避免境外** | douyin-cloud-streak（两个版本）、Gitee douyin-spark | "**IP 归属地一致性**：如果你常住上海，服务器也买在上海节点……被风控拦截的概率极低；**避免境外节点**：境外节点极易触发抖音'境外/异地登录'风控" | https://github.com/Yuriz132/douyin-cloud-streak ； https://gitee.com/jin-hui1688/douyin-spark |
| **家庭宽带 IP 风控最低（首选本地跑）** | 15467-lab/douyin-cloud-streak | "**家庭宽带 IP 比机房 IP 自然得多，风控风险最低**" | https://github.com/15467-lab/douyin-cloud-streak |
| **先用小号试跑几天/一周，再上主号** | douyin-cloud-streak（两个版本） | "强烈建议先用**小号试跑几天**"；"先用**小号**试跑一周确认稳定，再切主力号" | 同上 |
| **⚠️ 路线 A：本机登录、服务器只复用** | 15467-lab 版 + Gitee douyin-spark | "**登录态在本机拿，服务器只复用，绝不在服务器上登录**"；"登录态在本机扫码获取、服务器只复用，避免'机房 IP + 异地登录'触发风控" | 同上 |
| **⚠️ 路线 B：直接在服务器上扫码登录（与上一条相反）** | DouYinSparkFlow 作者分支版 | Issue #77 作者："直接在服务器上扫码登录现在一直没啥问题" | https://github.com/2061360308/DouYinSparkFlow/issues/77 |

> 📌 **重要提示（给架构师）**：上面"路线 A"和"路线 B"是**互相矛盾**的，且都有真实依据。
> - 15467-lab 版（2026-07）主张"本机登录，服务器只复用"；
> - DouYinSparkFlow（2026-08，更新）实测"本机 cookie 放服务器 → 被登出"，改成"服务器扫码"才稳。
>
> **合理解读**：抖音在 2026 年把校验收紧了（见 #59"更严格的机器人和浏览器环境校验"），老的"本机导出、异地复用"路线正在失效；**"登录环境 = 运行环境"才是当前更稳的方向**。
> 对我们的含义：SparkKeeper 是**自托管本机/NAS 部署**，登录和运行在同一台机器上，天然走的是路线 B，**这恰好是当前更稳的那条路**。这一点建议在产品文案里讲清楚，是差异化优势。

### 2.5 反检测 / 指纹伪装类（**注意：主流续火花项目基本没做**）

| 做法 | 谁这么做 | 具体参数 / 原文 | 来源 |
|---|---|---|---|
| **`add_init_script` 覆盖 `navigator.webdriver / plugins / languages` + `--disable-blink-features=AutomationControlled`** | douyin-chat-mcp-server（抖音私信 MCP，非续火花项目） | "抖音的前端检测非常严格。Playwright 默认的浏览器指纹会被识别为自动化工具。解决方案是在每个页面初始化前注入 stealth 脚本" | https://juejin.cn/post/7648378012811231268 |
| **"隐身无头浏览器" + 随机等待** | 15467-lab/douyin-cloud-streak（旧版） | 日志输出："🤖 启动隐身无头浏览器..."；README："脚本已加入随机等待与隐身参数" | https://github.com/15467-lab/douyin-cloud-streak |
| **playwright-stealth + `--headless=new` + 模拟鼠标移动** | TikTok-Api（TikTok 国际版生态，**非抖音**） | For Chromium, headless mode is implemented using the `--headless=new` argument rather than Playwright's built-in `headless=True` parameter: ... uses Chrome's newer headless implementation which is harder to detect | https://deepwiki.com/davidteather/TikTok-Api/2.3-browser-automation-with-playwright |
| **多重选择器回退（每个操作 5~6 种选择器）** | douyin-chat-mcp-server | "抖音是典型的 SPA，前端频繁重构……采用**多重选择器回退策略**——每个操作都准备了 5-6 种不同的 CSS 选择器" | https://juejin.cn/post/7648378012811231268 |

> ⚠️ **关键发现：本次检索的 4 个主流续火花项目（DouYinSparkFlow / douyin-auto-fire / douyin-auto-spark / Gitee douyin-spark）的 README 与 docs 中，都没有提到 stealth 注入、UA 伪装、指纹伪装。**
> 它们的风控对策几乎全部集中在：**随机延迟 + 随机内容 + 限量 + 错峰 + IP 一致性 + 限流熔断**。
> **含义**：不要把精力砸在指纹伪装上，**先把节奏和 IP 一致性做对**。

---

## 三、headless / 浏览器模式专项结论

### 3.1 先给结论

> **未检索到任何一条"抖音风控识别 headless / 必须 headless:false 才能稳定"的直接证据。**
>
> 事实恰恰相反：**本次检索到的主流续火花项目，日常运行几乎全部使用无头模式，且都能跑通。**
>
> **headless 不是主要矛盾。真正的矛盾是 IP + 设备指纹的一致性（见证据 2 / 3 / 4）。**

### 3.2 各项目的实际做法（事实清单）

| 项目 | 默认浏览器模式 | 原文 / 证据 | 来源 |
|---|---|---|---|
| **douyin-auto-fire** | `.env` 默认 **`HEADLESS=false`（有头）**，但文档建议日常改成 `true` | `.env.example`：`HEADLESS=false` | https://github.com/unmev/douyin-auto-fire/blob/main/.env.example |
| 同上 · Windows 文档 | **扫码登录和排错时用有头；日常自动运行用无头** | "第一次扫码登录和排查问题时，可以让浏览器正常显示。**日常自动运行建议使用 Headless 模式**。"（第 11 节"切换为无头模式"） | https://github.com/unmev/douyin-auto-fire/blob/main/docs/windows.md |
| 同上 · 服务器文档 | **明确推荐无头** | "服务器部署推荐使用 **Cookie + Headless Chromium + systemd Timer**。服务器不需要桌面环境。" | https://github.com/unmev/douyin-auto-fire/blob/main/docs/server.md |
| **douyin-auto-spark** | **默认无头 `true`**，可指定本机真实 Chrome/Edge | `PLAYWRIGHT_HEADLESS` 默认 `true`；`PLAYWRIGHT_BROWSER_PATH` 可填本机 Chrome / Chromium / Edge 路径 | https://github.com/bling-yshs/douyin-auto-spark |
| **DouYinSparkFlow** | **无头**（用 `chrome-headless-shell`） | "使用`PlayWright`以及`chrome-headless-shell`自动化操作抖音聊天网页版" | https://github.com/2061360308/DouYinSparkFlow |
| **15467-lab/douyin-cloud-streak** | **无头 + 隐身参数** | 运行日志："🤖 启动隐身无头浏览器..."；README："脚本已加入随机等待与隐身参数" | https://github.com/15467-lab/douyin-cloud-streak |
| **Gitee douyin-spark** | **无头** | 架构图："Playwright 无头浏览器" | https://gitee.com/jin-hui1688/douyin-spark |
| **gitee.com/lqqtoqre/douyin-spark**（Puppeteer 版） | **首次必须 `headless:false`（因为要看到二维码），之后 `headless:true`** | "首次运行（**必须 headless: false**）……浏览器会打开抖音，你扫码登录……之后运行 改配置 headless: true"；FAQ："Q: headless: true 还提示要登录？A: 说明 **Cookies 过期了**，切回 headless: false 重新登录一次就行" | https://gitee.com/lqqtoqre/douyin-spark |
| **TikTokAutoSparkWeb** | **Web UI 里给用户一个"是否显示浏览器"开关** | 更新记录："后端新增是否显示游览器" | https://github.com/DkoBot/TikTokAutoSparkWeb |
| **douyin-chat-mcp-server（Docker）** | **无头 + 二维码导出成 PNG** | `docker compose up -d` → `open ./data/login_qrcode.png` → 扫码 | https://juejin.cn/post/7648378012811231268 |

### 3.3 对三个具体问题的逐一回答

**Q1：Playwright / 无头浏览器是否被抖音风控识别？**
→ **未检索到直接证据。** 上面 7 个项目有 6 个在无头模式下日常运行并跑通。唯一"必须 headless:false"的说法（gitee.com/lqqtoqre/douyin-spark）原因是**要显示二维码给用户扫**，不是反检测；其 FAQ 明确把"headless:true 还提示要登录"归因于 **cookie 过期**。

**Q2：有没有项目/讨论提到必须 `headless:false`、用 `--headless=new`、或用真实浏览器 profile 才能稳定？**
- `headless:false`：**未检索到**任何"为了稳定必须关掉无头"的说法（只在"扫码/排错"场景被要求）。
- `--headless=new`：**未检索到**任何抖音续火花项目使用或提及。**仅**在 TikTok 国际版生态的 TikTok-Api 里看到该做法（https://deepwiki.com/davidteather/TikTok-Api/2.3-browser-automation-with-playwright），属于同集团产品的旁证，非抖音直接证据。
- **持久化浏览器 profile**：检索到 **1 个真实项目**在用——eric1981/douyin-monitor 用 `launch_persistent_context` 把 Cookie / LocalStorage / IndexedDB 持久化到 `douyin_session/` 目录（https://github.com/eric1981/douyin-monitor）。但**未检索到任何项目明确说"必须持久化 profile，否则会被风控"**。
  → "持久化 profile 更稳"是**合理推断**（因为每次新建干净 context 会让指纹每次都变），但**没有一手证据**，请勿对外当事实陈述。

**Q3：有没有"不能每次新建 context"的说法？**
→ **未检索到。** 相反，douyin-auto-spark 明确是"每个账号使用**独立浏览器上下文**"，且运行正常。

### 3.4 给架构师的落地建议（保守但不折腾）

1. **把 headless 做成配置项，默认跟随运行环境**：
   - 本机 / 有桌面环境 → 默认 `headless: false`（用户看得见，出问题好排查，也更接近真人环境）
   - 服务器 / Docker / 无桌面 → 默认 `headless: true`
   - 参考 TikTokAutoSparkWeb 的做法：**在 Web UI 上给用户一个"是否显示浏览器"开关**（https://github.com/DkoBot/TikTokAutoSparkWeb）
2. **比起纠结 headless，优先做"环境一致性"**：
   - **固定并复用 `user_data_dir`**（持久化 profile），不要每次新建干净 context —— 这一条虽然没有一手证据，但零成本、零副作用，且和"IP 一致性"同向。
   - **固定 timezone / locale 为 `Asia/Shanghai` / `zh-CN`**，固定 viewport（不要每次随机）。
   - **登录 IP 与运行 IP 必须同源**（这是有强证据的一条：DouYinSparkFlow #34 作者原话"因为卡ip，登陆用哪个ip后续都需要用"）。
3. **低成本加一层 stealth 无妨**（`--disable-blink-features=AutomationControlled` + 覆盖 `navigator.webdriver`），参考 douyin-chat-mcp-server 的做法（https://juejin.cn/post/7648378012811231268）。**但这不是主要矛盾，不要为它牺牲稳定性或开发排期。**
4. **不要把"必须是无头/必须是有头"写死成产品约束**——没有证据支持。

---

## 四、配置简化：竞品做法 + 可落地建议

### 4.0 我们现在的痛点（回顾）

当前 8 步：装依赖 → 跑脚本导出登录态(JSON) → 手动复制 → 粘贴到网页 → 设口令导入 → 切平台 → 加好友 → 改安全模式参数 → Dry Run

**诊断**：8 步里有 4 步（导出 / 复制 / 粘贴 / 设口令导入）都只为了做一件事——**把登录态弄进系统**。这是最大的浪费。

---

### 4.1 竞品在"降低新手门槛"上做对了什么

#### ✅ 做法 1：DouYinSparkFlow —— 在线配置生成器（把"手写 JSON"变成"填表单 + 一键复制"）

- **来源**：https://github.com/2061360308/DouYinSparkFlow/blob/main/docs/配置生成器使用.md
- **具体做法**：
  - 编辑器网址 `https://oilu.cn/DouYinSparkFlow`，托管在 GitHub Pages 上的**纯前端单页应用**（源码开源在 docs 目录，可审计）
  - 左侧填表单（消息模板 / 一言类型 / 账号匹配模式 / 超时 / 重试次数 / 日志级别 / 用户名 / Cookies / 好友昵称回车添加），**实时**生成 `Environment Variables` 和 `Environment Secrets` 两块，右侧/左侧提供"复制 .env 配置文件"按钮
  - "配置生成器会实时生成结果，填写完成后**无需额外保存或提交**"
- **它为什么不做自动获取 cookie（原文）**：
  > "**问：为什么需要手动获取 Cookies？** 答：在线网页无法直接读取您电脑或浏览器中的本地数据。若改为远程服务端方案，不仅部署与维护复杂度更高，还需要在远程设备上登录账号。当前采用手动获取并填写的方式，可尽量保证数据在本地处理且不保存以此保障您的数据安全。"
- **对我们的启发**：**这是"配置生成器"路线的天花板**——它能消灭手写 JSON，但**消灭不了"手动导出 cookie"**。我们如果要真正减少步骤，必须走"服务端扫码"路线（见做法 3）。

#### ✅ 做法 2：douyin-auto-fire —— 扫码登录脚本自动生成 storage-state + 配置生成器 + 极简首跑引导

- **来源**：https://github.com/unmev/douyin-auto-fire/blob/main/docs/windows.md
- **具体做法**：
  - **扫码登录脚本**：`python scripts/login.py` → 自动打开 Chromium → 手机扫码 → 回命令行按一下 Enter → **自动生成 `storage-state.json`**（**没有"导出 JSON → 复制 → 粘贴"这三步**）
  - **在线配置生成器**：https://douyin-config.pages.dev/ → 生成 config.json
  - **极简首跑引导（写进每一份文档的第一行）**："第一次使用建议只配置 **1 个抖音账号 + 1 个好友 + 1 条文字消息**"，先 `--dry-run`
  - **Dry Run 检查项明确列出**（Cookie 有效 / 能进私信页 / 能找到好友 / 配置正确）
  - **Cookie 失效兜底**：文档单独一节"Cookie 失效怎么办？"，4 步解决
- **对我们的启发**："1 账号 + 1 好友 + 1 条消息起步"这句意外的有效，值得原样抄。

#### ✅ 做法 3：Yuriz132/douyin-cloud-streak —— **Web 端一键扫码登录（我们要抄的核心对象）**

- **来源**：https://github.com/Yuriz132/douyin-cloud-streak
- **这是什么**：**服务器端起浏览器 → 二维码推到 Web 页面 → 手机扫 → 后端自动检测登录成功 → 自动落盘**。这就是主理人问的"Web 端一键唤起浏览器扫码并自动回填登录态"的**真实落地案例**。
- **具体流程（README 原文）**：
  > 1. 打开 `http://你的服务器IP:8000`
  > 2. 点击右上角「**令牌**」，填入部署完成时显示的 Token
  > 3. 点击左侧菜单进入「**凭证**」页面
  > 4. 点击蓝色的「**📱 手机扫码登录**」按钮，会先弹出一份《扫码须知》
  > 5. "页面会在 **20~40 秒** 内生成二维码 → 用**另一台手机的抖音 App** 扫一扫（或者截图后用抖音内置扫一扫识别相册图片）"
  > 6. "扫码确认后，页面提示「登录成功」即大功告成！"
- **它处理了二次验证（这点很关键）**：
  > "**不是的，平时登录就是普通的扫二维码，90% 以上的情况直接扫码就成功了。**"
  > "⚠️ 偶尔触发风控：抖音要求「二次验证」，页面出现**新的二维码**，常见形式是「手机刷脸验证」……用抖音 App 扫这个新二维码，在手机上完成刷脸/确认后回到网页，系统会自动检测通过"
- **Docker 场景同样适用**：
  > "Docker 部署用户：直接在网页上重新扫码即可，**无需动容器**。"
- **踩过的坑（我们要提前避）**：
  > "镜像内已内置中文字体与渲染依赖。若仍出现，执行 `docker compose restart` 后重新发起扫码；持续黑屏请到仓库提 Issue"
- **它还做了"一键部署 bat"（6 个编号脚本）**：
  - `1.本地提取通行证.bat`（弹 Chromium 扫码 → 存 state.json → 自动同步联系人 → 起本地后台）
  - `2.桌面端立即运行.bat`（正式/演练/仅同步 三选一）
  - `3.启动管理后台.bat`
  - `4.同步登录态到服务器.bat`（凭证过期时用，1 秒传完）
  - `5.服务器部署.bat`（⭐ 输入 IP 和密码 → 全自动 → 输出网址 + Token）
  - `6.Docker部署.bat`
  - README"一句话记住"：
    > "买好服务器后，**只需要点 5** 就能完成部署……之后登录、管理好友全部在**手机/电脑浏览器网页**里完成。"
- **Web UI 页面结构**：凭证 / 好友 / 定时 / 日志 / 账号（多账号）

#### ✅ 做法 4：Gitee douyin-spark —— 一键部署脚本 + Web 上传登录态 + 好友一键勾选

- **来源**：https://gitee.com/jin-hui1688/douyin-spark
- **一键部署脚本做了什么（README 原文）**：
  > `sudo bash deploy/deploy.sh` → "自动完成：安装依赖、安装 Chromium、创建 2G swap（1G 内存服务器需要）、设置上海时区、**生成随机访问令牌**、注册 systemd 服务并启动。完成后会输出**访问地址和令牌**"
- **Web 配置 7 步**（比我们的 8 步少，且每步都在同一套 UI 里）：
  > 1. 打开地址，输入令牌
  > 2. 左侧「+ 新增账号」
  > 3. 选中账号 → 「概览」页点「选择 state.json」→ 上传登录态
  > 4. 「好友与消息」页点「**获取聊天列表**」→ 勾选好友 → 保存
  > 5. 「定时设置」页设时间 + 抖动窗口
  > 6. 先点「**干跑测试**」验证 → 再点「立即发送」
  > 7. 重复加更多号
- **"好友一键勾选"（强烈建议抄）**：
  > "**好友一键勾选**：从聊天列表自动读取好友（含各自火花天数），勾选即用，免手动输入"

#### ✅ 做法 5：TikTokAutoSparkWeb —— 多种登录入口并存 + 登录态监测

- **来源**：https://github.com/DkoBot/TikTokAutoSparkWeb
- **账户管理功能清单（原文）**：
  > - 扫码登录（抖音 App 扫码授权）
  > - 手机号登录（含区号输入）
  > - 手动登录（Base64Cookie 方式）
  > - **Cookie 一键导出**
  > - **登录状态实时监测**
  > - **上次登录 IP 记录**
  > - 管理员密码修改
- **启发**：**"多入口并存"是对的**——扫码是主路径，手动 Base64 是降级通道，不要二选一。而且"上次登录 IP 记录"这个细节对我们排查"异地登录被踢"非常有价值。

#### ✅ 做法 6：douyin-chat-mcp-server —— Docker 内无头扫码，二维码导出成 PNG（**最轻量，不需要 VNC**）

- **来源**：https://juejin.cn/post/7648378012811231268
- **具体做法**：
  ```bash
  docker compose up -d
  # 查看二维码
  open ./data/login_qrcode.png
  # 扫码后即可通过 http://localhost:6789/sse 连接
  ```
  > "首次启动会自动打开浏览器，用手机抖音 App 扫码登录。登录态自动保存到 `~/.douyin_mcp/storage.json`，下次启动自动恢复。"
  > "登录态过期时自动检测并触发重新扫码。"
- **启发**：**服务端无头浏览器打开登录页 → 截图二维码元素 → 存成 PNG / 接口返回 base64 → 用户扫 → 后端轮询检测登录态 → 落盘**。这条路完全不需要 VNC，实现成本远低于 VNC。

#### ❌ 关于 VNC / noVNC 扫码：结论是"没人真的做"

- **检索结果**：VNC 方案**只在 DouYinSparkFlow Issue #77 里被用户提议过一次**（原文："比如说用vnc连接浏览器，取 cookie"），
  来源：https://github.com/2061360308/DouYinSparkFlow/issues/77
- **未检索到**任何续火花项目真正实现了 VNC / noVNC 扫码登录。
- **趋势判断**：所有项目都在往"**服务端无头 + 二维码回传到 Web 页面 / PNG 文件**"这条更轻的路上走（Yuriz132 的 Web 凭证页、douyin-chat-mcp-server 的 login_qrcode.png）。
- **建议**：**不要做 VNC**。成本高（要装桌面、X server、中文字体、转发端口）、体验差（要教用户连 VNC），且有成熟替代方案。

#### ⚪ 关于青龙面板：只有宣传语，没找到真东西

- DouYinSparkFlow README 提到"也可源码部署至自有服务器，**青龙/白虎等任务管理面板**"（https://github.com/2061360308/DouYinSparkFlow）
- 但**未检索到**专属的青龙一键部署脚本、订阅命令或 `ql repo` 链接。
- **建议**：先不做。

---

### 4.2 可落地到 SparkKeeper 的简化建议（按 **收益/成本** 从高到低排序）

> 每条只说思路，不写代码。

---

#### 🥇 建议 1【收益：极高 ｜ 成本：中】Web 端一键扫码登录 —— 直接砍掉 4 步

**砍掉**：跑脚本导出 JSON → 手动复制 → 粘贴到网页 → 设口令导入（4 步 → 1 步）

**思路**：
1. 前端「凭证」页放一个「📱 手机扫码登录」按钮（照抄 Yuriz132 的按钮名和交互）。
2. 点按钮 → 后端起一个 Playwright 浏览器打开 `https://www.douyin.com/chat` 的登录页。
3. 后端**截图二维码元素**，通过接口或 WebSocket 每 2 秒推一次给前端（二维码有效期短，必须刷新）。参照 Yuriz132 的"20~40 秒内生成二维码"。
4. 用户用**另一台手机**的抖音 App 扫（注意：不能用同一台设备，因为二维码就在那台设备的页面上）。
5. 后端**轮询检测登录状态**，成功后 `storage_state` 落盘 → **用我们已有的 AES-256-GCM 加密存好** → 前端提示"登录成功"，自动进入下一步。
6. **必须处理二次验证**：抖音偶尔要求刷脸，页面需要能显示"出现了新的二维码"并重新推送（Yuriz132 明确提到这点，说 90% 情况直接扫码成功）。
7. **降级通道**：保留"手动粘贴 JSON"入口（网络受限、扫码失败、或用户就是想用 Cookie-Editor 时用）。

**技术要点（提前避坑）**：
- 无头模式下截图可能黑屏 → 镜像/依赖要带**中文字体与渲染库**（Yuriz132 踩过，写在 README 里）。
- 二维码有时效，要做过期自动刷新。
- 后端要设超时（比如 3 分钟没扫就关掉浏览器，别一直开着吃内存）。

**参考实现**：
- https://github.com/Yuriz132/douyin-cloud-streak （「凭证」页完整流程 + 二次验证处理）
- https://juejin.cn/post/7648378012811231268 （Docker 内无头扫码 + `login_qrcode.png`，最简版）
- https://github.com/DkoBot/TikTokAutoSparkWeb （扫码 / 手机号 / 手动 Base64 三种入口并存）

---

#### 🥈 建议 2【收益：高 ｜ 成本：极低】"一键拉取好友 + 勾选" —— 砍掉手动输入昵称

**砍掉**：手动输入好友昵称（同时消灭"打错字发给别人"的风险）

**思路**：
1. 登录成功后，自动调一次会话列表读取，把**好友名 + 当前火花天数**拉成一张表，按火花天数倒序排。
2. 提供「✨ 一键勾选所有带火花的好友」按钮，也允许手动增删勾选。
3. 保存即可，不需要用户手打任何名字。

**为什么收益高**：
- 直接消灭"昵称打错"这个最高危的错误（Gitee douyin-spark 和 douyin-auto-fire 都为此专门做了防错发校验）。
- 顺带解决"好友改昵称就搜不到"的问题（douyin-auto-spark 因此建议用备注名 —— 但拉取列表勾选根本不需要名字，一步到位）。

**参考实现**：
- https://github.com/Yuriz132/douyin-cloud-streak：「🚀 同步联系人」（约 10~30 秒，按火花天数倒序）+「✨ 一键勾选火花好友」
- https://gitee.com/jin-hui1688/douyin-spark：「获取聊天列表」→ 勾选

---

#### 🥉 建议 3【收益：高 ｜ 成本：极低】把 8 步压成一条 3 屏向导，安全模式改为三档预设

**思路**：
- **第 1 屏**：扫码登录（建议 1）
- **第 2 屏**：勾选好友（建议 2）
- **第 3 屏**：选时间 + 选内容 → 点「完成并跑一次 Dry Run」

**关键改动**：
1. **"改安全模式参数"这一步直接删掉**，改成三档预设按钮：
   - **保守**：更大随机间隔（比如 30~90s）、单账号好友数上限 5、触发限流立即停
   - **标准**（默认）：间隔 3~8s（照抄 douyin-auto-fire）、上限 20（照抄 douyin-cloud-streak）、失败重试 1 次
   - **激进**：不推荐，高级设置里折叠
   - 数据来源：douyin-auto-fire `send_interval_seconds: {min:3, max:8}`；douyin-cloud-streak "单账号每日不超过 20 人"；Gitee douyin-spark "少量好友（几个到十几个）最稳"
2. **"切平台"这一步删掉** —— 我们只支持 `douyin.com/chat`，别让用户在 UI 上做一个没有可感知价值的选择。
3. **Dry Run 从"一个独立步骤"变成"向导的最后一步"**，点完成自动跑一次，过了就点亮绿色，失败直接把失败截图/日志摆出来（照抄 douyin-auto-fire 的失败诊断：日志 + 截图 + Trace）。
4. **首跑极简引导**：在向导里写死"第一次建议只勾 1 个好友 + 只发 1 条"（照抄 douyin-auto-fire 那句"第一次使用建议只配置 1 个账号 + 1 个好友 + 1 条文字消息"）。

---

#### 🏅 建议 4【收益：中 ｜ 成本：低】登录态健康度看板 + 过期主动提醒

**为什么值得做**：cookie 过期是**最高频故障**（多个项目都说"几天到几周"，eric1981/douyin-monitor 说 7~30 天）。用户不知道过期了，火花就静默断了 —— 这比封号更影响体验。

**思路**：
1. 首页顶部放一个状态条：🟢 登录态正常（剩余 N 天） / 🔴 登录态已过期，请重新扫码。
2. 过期时**主动推通知**（我们已有通知通道的话）+ 前端一进去就弹提示。
3. 记录**上次登录 IP**（照抄 TikTokAutoSparkWeb 的"上次登录 IP 记录"）—— 用户一旦发现 IP 变了，就能预判"异地登录可能被踢"。
4. 重新登录就是点一下「📱 手机扫码登录」，30 秒搞定（建议 1 的直接收益）。

**参考实现**：
- https://gitee.com/jin-hui1688/douyin-spark："掉线提醒：登录态失效时网页状态标红，重新扫码上传即可恢复"
- https://github.com/DkoBot/TikTokAutoSparkWeb："登录状态实时监测、上次登录 IP 记录"

---

#### 🏅 建议 5【收益：中 ｜ 成本：中】一键部署脚本 / Docker Compose，吃掉"装依赖"这步

**为什么排在第 5**：我们的目标用户是**普通个人用户**（不是开发者），"装 Node + 装 Playwright + 下载 Chromium"对他们就是天堑。但从收益看，它排在建议 1~3 之后，因为 1~3 解决的是"每次都要做"的痛，这个只痛一次。

**思路（照抄 Gitee douyin-spark 的 `deploy.sh`，把每一步都抄全）**：
1. 一条命令（`bash deploy.sh` 或 Windows 的 `1.一键部署.bat`）自动完成：
   - 装系统依赖 + Node + Playwright + Chromium（**国内源加速**）
   - 内存不足时自动建 2G swap（Gitee 版明确写了 1G 内存跑无头 Chromium 需要，峰值 500~700MB）
   - 设置 `Asia/Shanghai` 时区
   - **生成随机访问令牌并打印**（不要再用默认口令，也不要让用户自己设）
   - 注册 systemd 服务 / Windows 计划任务并启动
   - **最后输出访问网址 + 令牌**（Gitee 版和 Yuriz132 版都这么做，体验很好）
2. Windows 用户特别处理：提供 `.bat` 双击脚本（Yuriz132 的 6 个编号 bat 就是给 Windows 用户的，命名用数字前缀保证执行顺序一目了然）。

**参考实现**：
- https://gitee.com/jin-hui1688/douyin-spark （`deploy/deploy.sh`）
- https://github.com/Yuriz132/douyin-cloud-streak （6 个编号 .bat，命名与 README"一句话记住"很值得抄）

---

### 4.3 简化前后对比

| 阶段 | 现在 | 优化后 |
|---|---|---|
| 装环境 | 装依赖（手动） | 一键部署脚本（建议 5）→ 或本机免安装 |
| 拿登录态 | 跑脚本导出 JSON → 复制 → 粘贴 → 设口令导入（4 步） | **点「手机扫码登录」→ 手机扫 → 自动回填**（1 步，建议 1） |
| 选平台 | 切平台（1 步） | **删除**（写死 douyin.com/chat） |
| 加好友 | 手动输入昵称（1 步，有打错风险） | **一键拉取 + 勾选**（1 步，零风险，建议 2） |
| 调参数 | 改安全模式参数（1 步，用户看不懂） | **三档预设，默认标准**（0 步，建议 3） |
| 验证 | Dry Run（1 步） | **向导最后一步自动跑**（建议 3） |
| **合计** | **8~9 步** | **3 屏向导（扫码 → 勾好友 → 选时间内容+自动 Dry Run）** |

---

## 五、结论与提醒

### 5.1 三条核心结论

**① 封号风险：真实案例为零，但别当成安全。**
- 检索覆盖的全部公开信息中，**没有一条**"因跑续火花脚本被封号 / 被封私信 / 被禁言"的真实报告。
- 真实发生过的后果只有三类：**掉登录（最多）、弹验证码（少量）、消息发不出去（平台改版/接口故障）**。
- 但样本少、项目新、且 2026 年抖音刚下线创作者中心私信入口（风控在变），**"未检索到"不等于"不存在"**。所有竞品都在 README 写了限流/封禁免责声明，我们也必须写。

**② headless 不是问题，IP/环境一致性才是。**
- **未检索到**任何"抖音识别 headless"的直接证据。主流续火花项目（7 个里 6 个）日常都用无头模式且跑得通。
- 真正的杀伤点是有强证据的：**"卡 IP，登录用哪个 IP 后续都得用"**（DouYinSparkFlow 作者原话）、**"本地和服务器 IP、设备指纹不匹配 → 被登出"**（Issue #77）。
- 好消息：**SparkKeeper 是自托管本机/NAS 部署，登录和运行天然同机同 IP，恰好踩在最稳的那条路线上** —— 这值得写进产品文案当卖点。
- 建议：headless 做成可配（默认跟随环境）+ 固定 `user_data_dir` / 时区 / locale / viewport，**别在指纹伪装上浪费排期**。

**③ 最该做的三件事**：见 4.2 的建议 1 / 2 / 3 —— **Web 扫码登录（砍 4 步）> 好友一键勾选（砍 1 步 + 消灭发错人风险）> 3 屏向导 + 安全模式三档预设（砍 2 步 + 降低理解成本）**。

### 5.2 四条提醒（给主理人 & 架构师）

1. **必须在产品内显著位置放风险提示与免责声明** —— 所有竞品都放了，措辞可直接参考 DouYinSparkFlow README 与 Gitee douyin-spark 的"安全与合规"章节。建议明确写："仅限本人账号、少量好友、每天一条；自动化发私信违反抖音社区公约，存在被风控、限流甚至封号的风险。"

2. **"登录态过期"才是真正的高频故障，不是封号。** 用户流失的主因很可能是"静默断火而没察觉"，所以建议 4（健康度看板 + 过期提醒）虽然排在后面，但**产品价值被低估了**，建议在 P1 而不是 P2。

3. **不要做 VNC。** 检索到的唯一提及是 Issue #77 里用户的一句提议，**没有任何项目真正实现**；所有项目都在往"服务端无头 + 二维码回传 Web 页面/PNG"这条更轻的路上走。

4. **"本机导出 cookie → 服务器复用"这条路线正在失效。** 2026-07 的 douyin-cloud-streak 还主张这么干，2026-08 的 DouYinSparkFlow 实测已经"被登出"。如果我们未来要支持"多机部署/远程托管"，**登录必须在运行机上完成**，不能再沿用旧的导出-复制模式。

### 5.3 关于"抖音处罚方式"的信息可信度提醒

表格 1.3 里的"封禁率超 91%""冻结私信 30 天""1 分钟 5 条"等数字，**全部来自营销/SEO 内容站，无一能追溯到抖音官方文件**。
→ **请勿在 PRD、产品文案或用户沟通中引用这些数字**。如果要向用户说明风险，用竞品 README 里那句模糊但安全的表述："存在被风控、限流甚至封号的风险，请自行承担"。

---

## 六、附录：本次检索的缺口（诚实交代）

以下内容**未能检索到**，特此声明，避免后续被当成"已确认不存在"：

1. **DouYinSparkFlow 的 Discussions 列表页两次请求均返回 GitHub 错误页**（"Sorry, something went wrong"），只成功取到 #76。**#1~#75 的讨论内容未检索。**
   来源尝试：https://github.com/2061360308/DouYinSparkFlow/discussions

2. **unmev/douyin-auto-fire 的 Open Issues 列表页首次返回 "No results"**（该仓库当前应无 open issue），Closed Issues 列表成功取到 8 条（#4/#5/#6/#8/#10/#11/#13/#14），并逐条打开了 #8、#13。

3. **青龙面板专属的一键部署脚本 / `ql repo` 订阅命令**：未检索到（DouYinSparkFlow README 里只出现"青龙/白虎等任务管理面板"的宣传语）。

4. **VNC / noVNC 扫码登录的真实实现**：未检索到（只有 Issue #77 里的一句用户提议）。

5. **抖音官方针对"个人账号每天 1 条发给固定好友"的处罚条款原文**：未检索到。

6. **"抖音风控识别 headless"的直接证据**：未检索到（详见第三章）。

7. **`--headless=new` 在抖音（非 TikTok）项目中的使用**：未检索到。

8. **"必须持久化浏览器 profile 否则被风控"的明确说法**：未检索到（只有 eric1981/douyin-monitor 一个项目在用 `launch_persistent_context`，但未说明原因是反风控）。

---

## 附：本报告引用的全部来源清单

**竞品仓库（一手）**
- https://github.com/unmev/douyin-auto-fire
- https://github.com/unmev/douyin-auto-fire/issues/8
- https://github.com/unmev/douyin-auto-fire/issues/13
- https://github.com/unmev/douyin-auto-fire/blob/main/.env.example
- https://github.com/unmev/douyin-auto-fire/blob/main/docs/server.md
- https://github.com/unmev/douyin-auto-fire/blob/main/docs/windows.md
- https://github.com/unmev/douyin-auto-fire/blob/main/docs/github-actions.md
- https://github.com/2061360308/DouYinSparkFlow
- https://github.com/2061360308/DouYinSparkFlow/issues/28
- https://github.com/2061360308/DouYinSparkFlow/issues/34
- https://github.com/2061360308/DouYinSparkFlow/issues/40
- https://github.com/2061360308/DouYinSparkFlow/issues/58
- https://github.com/2061360308/DouYinSparkFlow/issues/59
- https://github.com/2061360308/DouYinSparkFlow/issues/61
- https://github.com/2061360308/DouYinSparkFlow/issues/77
- https://github.com/2061360308/DouYinSparkFlow/discussions/76
- https://github.com/2061360308/DouYinSparkFlow/blob/main/.env.example
- https://github.com/2061360308/DouYinSparkFlow/blob/main/docs/Docker部署说明.md
- https://github.com/2061360308/DouYinSparkFlow/blob/main/docs/配置生成器使用.md
- https://github.com/2061360308/DouYinSparkFlow/blob/main/docs/Action部署说明.md
- https://github.com/bling-yshs/douyin-auto-spark
- https://github.com/bling-yshs/douyin-auto-spark/issues/28
- https://github.com/15467-lab/douyin-cloud-streak
- https://github.com/Yuriz132/douyin-cloud-streak
- https://gitee.com/jin-hui1688/douyin-spark
- https://gitee.com/lqqtoqre/douyin-spark
- https://github.com/DkoBot/TikTokAutoSparkWeb
- https://github.com/eric1981/douyin-monitor
- https://github.com/xiaowang0715/DYAutoSpark
- https://github.com/wingchen0418/DouYinSparkFlow （DouYinSparkFlow 的 dev 分支镜像）

**社区 / 技术文章**
- https://linux.do/t/topic/2757825 （抖音自动续火花，作者发帖）
- https://juejin.cn/post/7648378012811231268 （抖音私信 MCP 服务器 · Docker 扫码 + stealth）
- https://juejin.cn/post/7673908614837813299 （douyin-auto-fire 使用教程）
- https://deepwiki.com/davidteather/TikTok-Api/2.3-browser-automation-with-playwright （TikTok-Api 的 Playwright 反检测）
- https://dev.to/scraping_eng/browser-fingerprinting-and-captchas-why-headless-chrome-gets-caught-and-how-to-fix-it-3054 （通用 headless 指纹原理）
- https://bbs.tampermonkey.net.cn/forum.php?mod=viewthread&tid=9622 （油猴脚本版续火花助手）

**二手风险信息（可信度低，仅供背景参考）**
- https://geo.newrank.cn/news/8045
- http://www.hfab.cn/canyinguanli/4161.html
- https://www.yunduoketang.com/study/bot23827.html
- https://developer.cloud.tencent.com.cn/article/2682151

---

*报告完*
