# 抖音「自动续火花」GitHub 生态调研报告

> 调研日期：2026-08-22 ｜ 调研人：产品经理「许清楚」（软件研发团队）
> 调研目的：帮助用户判断——若想自己做一个"不千篇一律"的抖音自动续火花项目并上传 GitHub，现有生态长什么样、雷同点在哪、差异化机会在哪、有哪些合规与风控风险。
> 方法说明：本报告基于 WebSearch + WebFetch 对 GitHub 及公开镜像站的真实检索，所有仓库 URL 均为可点击真实链接；未能核实的数据（如部分 Stars/Forks）已如实标注"未公开/未能抓取"，未编造任何仓库。

---

## 一、调研背景与一句话结论

抖音好友之间有"火花"标识，连续多天互动（互发私信/点赞/一起看视频等）会升级火花等级。很多用户希望用脚本每天自动和好友产生一次互动来"续火花"，避免手动麻烦。

**一句话结论**：GitHub 上抖音续火花项目已经相当"内卷"，主流方案高度同质——几乎都是"用 Playwright 驱动抖音网页版 + Cookie 登录 + 每天定时发一条随机文案/表情"。要做出差异化，不应在"更稳地自动发消息"上卷，而应转向 **隐私优先、合规的半自动提醒、跨平台可插拔、拟人化与上下文感知、可视化仪表盘** 等方向。

---

## 二、生态总览（数据画像）

按技术路线，GitHub 上可见的相关项目大致分六类（含抖音专属 + TikTok 跨平台参考）：

| 技术路线 | 代表项目数（可见） | 成熟度 | 风控风险 | 备注 |
|---|---|---|---|---|
| ① 网页浏览器自动化（Playwright/Puppeteer） | 9+ | 高（最主流） | 中-高 | 抖音续火花绝对主流 |
| ② 浏览器用户脚本（Tampermonkey） | 1 | 中 | 中 | 仅在网页端运行 |
| ③ 安卓端自动化（Auto.js / 无障碍） | 3+ | 中 | 中 | 需安卓手机 + 无障碍 |
| ④ Hook / 逆向 API（Xposed / 协议逆向） | 4+ | 高（但更"灰"） | 高 | 含 GiveMeFire、DouYin_Spider |
| ⑤ AI Agent / MCP 集成 | 1+ | 早期 | 中 | 把私信能力暴露给 AI |
| ⑥ TikTok 跨平台参考（灵感） | 5+ | 高 | 中 | 思路可借鉴到抖音 |

**数量判断**：仅"抖音续火花"关键词下就检索到 5+ 个高度相似的 Playwright 仓库（多为互相 fork），说明该细分赛道已明显拥挤、方案雷同。

---

## 三、代表性项目清单（按技术路线分类）

> 说明：Stars/Forks 列中，**加粗数字为已核实数据源**；标注"未抓取"表示 GitHub 侧栏懒加载未能在本次抓取中取到精确值，不代表该项目无人气。

### 3.1 网页浏览器自动化（Playwright / Puppeteer）—— 主流赛道

| 仓库 | URL | Stars/Forks | 语言 | License | 最近更新 | 核心实现 | 亮点 | 明显缺陷/风险 |
|---|---|---|---|---|---|---|---|---|
| **2061360308/DouYinSparkFlow**（生态源头，被多处 fork） | https://github.com/2061360308/DouYinSparkFlow | 未抓取（被 Microst/Echozxc/wzeffort/molimi20 等多个仓库 fork，推断为最热） | Python | MIT | **2026-08-22** | Playwright + chrome-headless-shell 操作抖音创作者中心；GitHub Actions 定时 | 多用户/多目标、一言支持、在线配置生成器、dev 分支迁 douyin.com/chat | Cookie 易过期；8-22 刚修复多账号串号错发 bug，说明并发稳定性曾有问题 |
| Microst/DouYinSparkFlow | https://github.com/Microst/DouYinSparkFlow | 未抓取 | Python | 未声明 | 2025-12-14 | 同上（上游 fork） | 多用户多目标 | 已落后上游 32 commits；proxyAddress 代理未实现 |
| Echozxc/DouYinSparkFlow | https://github.com/Echozxc/DouYinSparkFlow | 未抓取 | Python | MIT | 2026-04-28 | 同上 + 在线可视化配置工具 | 新手友好、Fork 即用、讨论区 | 维护停留在 4 月；dev 分支未合并 |
| Xiaowu-0916/douyin-spark | https://github.com/Xiaowu-0916/douyin-spark | 未抓取 | Python + FastAPI | MIT | **2026-08-20** | Playwright + 自托管 Web UI（Vue3+ElementPlus） | **最精致之一**：网页勾选好友、随机时间窗口+随机文案+好友间随机间隔、切人校验、发送校验、当日补发、限流熔断、掉线标红、1核1G 可跑 | 仍依赖 Cookie 过期重扫；明确自承违反社区公约 |
| Yuriz132/douyin-cloud-streak | https://github.com/Yuriz132/douyin-cloud-streak | 未抓取 | Python + Web | 未声明 | **2026-08-22** | 云服务器一键部署 + 网页后台 | **零基础小白向**：一键部署脚本、网页"一键勾选火花好友"、同城节点风控建议、家庭电脑备选方案 | 教程导向，代码工程化偏弱；无 License |
| rD227/douyin-auto-spark | https://github.com/rD227/douyin-auto-spark | fork 自 bling-yshs（见下） | TypeScript | GPL-3.0 | **2026-08-19** | TS + Playwright + GitHub Actions | Cookie 登录、多会话、随机一言、邮件失败提醒 | 定时任务排队延迟；GPL 传染性 |
| bling-yshs/douyin-auto-spark | https://github.com/bling-yshs/douyin-auto-spark | **40 / 77**（reporank 2026-08-21） | TypeScript | GPL-3.0 | 2026-08-20 | 同上（rD227 的上游） | GitHub Actions 免费定时、轻量依赖 | 仅文本、无重试、无图片、Cookie 数天过期 |
| unmev/douyin-auto-fire | https://github.com/unmev/douyin-auto-fire | **31 / 38**（reporank 2026-08-22） | Python | MIT | 2026-08-21 | Playwright + GitHub Actions（无服务器） | Dry Run 模式、去重防重复发、钉钉失败通知、截图/日志 | 登录态过期需手动重登；无无人值守恢复 |

### 3.2 浏览器用户脚本（Tampermonkey / ScriptCat）

| 仓库 | URL | 语言 | License | 最近更新 | 核心实现 | 亮点 | 缺陷/风险 |
|---|---|---|---|---|---|---|---|
| ys0801/DouYinSpark | https://github.com/ys0801/DouYinSpark | JavaScript（油猴脚本） | 未声明（仅"学习交流"声明） | 2026-05-30 | 注入抖音创作者中心聊天页，自动抓取列表、定时发 | 模板变量（$date/$targetName/$sinceDate()）、宏系统、Monaco 编辑器、可拖拽面板、群聊支持 | 无明确开源协议（法律风险）；仅网页端；依赖页面结构 |

### 3.3 安卓端自动化（Auto.js / 无障碍服务）—— 需真机

| 仓库 | URL | 语言 | License | 最近更新 | 核心实现 | 亮点 | 缺陷/风险 |
|---|---|---|---|---|---|---|---|
| xiaowang0715/DYAutoSpark | https://github.com/xiaowang0715/DYAutoSpark | JavaScript（AutoJs6） | 未声明 | 2025（未抓到精确日） | AutoJs6 定时唤醒→解锁→打开抖音→发消息→强制停止+锁屏 | 发完自动退出省电、保护隐私 | 需数字密码、需手动配坐标、无障碍易被系统关闭 |
| Haven-Lv/autojs6-douyin-sendMessage | https://github.com/Haven-Lv/autojs6-douyin-sendMessage | JavaScript（AutoJs6） | 未声明 | 2025（未抓到精确日） | AutoJs6 单方续火花、解锁、关弹窗 | 无需 Root、自动结束抖音后台 | 需备用机常亮息屏；卡死需手动清任务 |
| awoo/auto-js6-tiktok-auto-spark（Gitee） | https://gitee.com/awoo/auto-js6-tiktok-auto-spark | JavaScript（AutoJs6） | 未声明 | 2025-07 | AutoJs6 多好友遍历 | 名人名言接口取内容 | 镜像站，活跃度低 |

### 3.4 Hook / 逆向 API（Xposed / 协议逆向）—— 更"灰"、风险更高

| 仓库 | URL | 语言 | License | 最近更新 | 核心实现 | 亮点 | 缺陷/风险 |
|---|---|---|---|---|---|---|---|
| **GiveMeFire**（Xposed 模块 me.yfishyon.fire） | https://github.com/Xposed-Modules-Repo/me.yfishyon.fire | Java（LSPosed） | 未声明 | **2026-05-17**（仍在更） | LSPosed Hook 抖音（com.ss.android.ugc.aweme），聊天页开关续火花 | 支持滑动引用、自定义气泡、隐身模式、**修改聊天记录** | 需 Root/LSPosed；"修改聊天记录"功能踩法律红线；商店下架风险 |
| **cv-cat/DouYin_Spider** | https://github.com/cv-cat/DouYin_Spider | Python + Node | 未声明 | 2026-08-18 | **抖音 Web API 逆向 + WebSocket**（私信收发、直播间监听、爬虫） | **生态最大相关库**：**2,563 Stars / 680 Forks**（tool.lu，2026）；封装全部 API、protobuf、Cookie 池 | 逆向 API 易被抖音改版打崩；无 License；明显踩平台规则 |
| 6dlz/douyin-chat-export | https://github.com/6dlz/douyin-chat-export | Vue3 + FastAPI | 未声明 | 2026-04 | 直接调抖音 IM protobuf 接口导出聊天记录 | 本地浏览、媒体解密、定时任务 | 逆向接口；偏"导出"非"续火" |
| sanbap6537/xposed-aweme | https://github.com/sanbap6537/xposed-aweme | Java | Apache-2.0 | 2018（老旧） | Xposed 抖音插件（自动播放/点赞/评论/下载） | 早期代表作 | 适配旧版抖音；已过时 |
| qfant/xposed-douyin | https://github.com/qfant/xposed-douyin | Java | 未声明 | 2020 | Xposed：直播控场/群发/自动回复/点赞 | 功能全 | 老旧、群发明显违规 |

### 3.5 AI Agent / MCP 集成（新兴）

| 仓库 | URL | 语言 | License | 最近更新 | 核心实现 | 亮点 | 缺陷/风险 |
|---|---|---|---|---|---|---|---|
| Lozzi1910/Douyin-mcp | https://github.com/Lozzi1910/Douyin-mcp | Python（FastMCP + Playwright） | **AGPL-3.0** | 2026-06-04 | 把抖音网页版私信能力暴露为 MCP 工具（search_user/read_messages/send_message），Draft.js 注入发消息 | 让 AI（Claude/Cursor）收发抖音私信；Docker 一键部署；stealth 反检测注入 | 含**商业闭源收费版（¥499/¥2999）**，开源协议与商业化混合易引发争议；AGPL 对闭源集成不友好 |

### 3.6 TikTok 跨平台参考（差异化灵感，非抖音但思路可直接借鉴）

| 仓库 | URL | 语言 | License | 核心实现 | 可借鉴点 |
|---|---|---|---|---|---|
| Hungdiamond/tiktok-streak | https://github.com/Hungdiamond/tiktok-streak | Python | 未声明 | Cookie + 好友 CSV + 定时发 | 用 captcha API key 处理验证码——可借鉴"验证码兜底"思路 |
| dewhush/TikTok-Streak-API | https://github.com/dewhush/TikTok-Streak-API | Python（FastAPI） | MIT | **REST API + Telegram 通知 + 联系人管理** | **"可插拔平台/API 化"架构范本**：把续火做成服务，外部可调度 |
| thetrekir/TikTok-Streak-Bot | https://github.com/thetrekir/TikTok-Streak-Bot | Python（Selenium） | 未声明 | Cookie + 定时 + 详细日志 | 真实数据：90 天 95% 成功率；诚实披露"失败多因平台抽风" |
| Jon2G/TiktokStreakSaver | https://github.com/Jon2G/TiktokStreakSaver | C#（.NET MAUI） | MIT | **安卓 App + WebView + 23h 定时 + 仪表盘（成功率环图/进度条）** | **原生 App + 可视化仪表盘 + 随机消息池**的成熟范本 |
| eulfn/streak-tiktok | https://github.com/eulfn/streak-tiktok | C# | MIT | TikTokStreakSaver 上游 | 同上 UX 基础 |

---

## 四、技术路线对比（原理 / 优缺点 / 门槛 / 风控风险）

| 路线 | 原理 | 优点 | 缺点 | 技术门槛 | 封号/风控风险 |
|---|---|---|---|---|---|
| **① Playwright 网页自动化**（主流） | 驱动无头浏览器打开 douyin.com/chat，注入 Cookie，定位会话，填 Draft.js 输入框发消息 | 跨平台、无需 Root、改动快、社区方案最多 | UI 一改就崩；Cookie 数天~数周过期需重扫；GitHub Actions 定时排队；每月有免费额度上限 | 低-中（Python/TS 基础） | **中-高**（行为检测+异地登录+验证码） |
| **② Tampermonkey 用户脚本** | 注入已登录的抖音网页，操作 DOM | 免部署、改起来最轻 | 仅网页端、依赖页面结构、需手动开页面 | 低 | 中（同网页自动化） |
| **③ Auto.js 安卓无障碍** | 真机模拟点击/输入，定时任务 | 像真人操作、无需逆向、可锁屏省电 | 需安卓备用机、无障碍易被系统杀、需配坐标/昵称、中文输入靠剪贴板 | 低-中 | 中（设备维度风控） |
| **④ Xposed/LSPosed Hook** | Hook 抖音 App 内部方法 | 能力强（可改气泡/隐身/记录） | 需 Root/LSPosed、适配各版本抖音、易崩、商店下架 | 高（Android 逆向） | **高**（最易被检测/封号） |
| **⑤ 逆向 API / protobuf** | 直接构造抖音私有 API 请求（含签名/X-Bogus） | 不依赖 UI、速度快、可批量 | 抖音改版即失效、需持续维护签名、法律灰 | **高**（协议逆向） | **高**（协议层风控最严） |
| **⑥ MCP / AI Agent** | 把发私信封装成 AI 可调工具 | 可结合 LLM 做拟人化内容 | 仍底层走网页自动化；商业化争议 | 中-高 | 中-高（取决于底层） |

**风险等级小结**：协议逆向 ≈ Xposed Hook > Playwright 网页自动化 ≈ Auto.js > 用户脚本 / MCP（底层仍网页）。所有路线都绕不开"抖音登录态 + 行为风控"。

---

## 五、合规与风控风险（客观提示，不鼓励违规）

### 5.1 平台立场
- 抖音《用户服务协议》及社区公约明确：**未经平台允许，采用自动化/脚本手段批量或定时发私信属于违规行为**。多个项目 README 已自承"违反社区公约，存在被风控/限流/封号风险，后果自负"。
- 几乎所有仓库都在免责声明里写"仅限个人少量好友、每天一条、禁止商业营销/批量骚扰"。

### 5.2 抖音的风控手段（公开可观察到）
- **设备指纹**：浏览器 UA、WebDriver 标记（navigator.webdriver）、Canvas/字体指纹；部分项目用 stealth 脚本伪装（如 Douyin-mcp 的 add_init_script）。
- **登录态/异地检测**：Cookie 登录城市与日常不一致易触发验证；**机房/境外 IP 风险最高**（Yuriz132 教程专门建议"买同城国内节点"）。
- **行为检测**：发送频率、消息相似度、互动是否"像真人"（固定文案、秒发、无阅读即发都会被识别）。
- **验证码**：登录/安全验证弹窗；GitHub Actions 方案大多不绕验证码，过期需人工重登。
- **内容风控**：营销词、外链、诱导跳转会被拦截或限流。

### 5.3 账号封禁风险
- 轻度：功能限流、弹验证、临时禁止私信。
- 重度：降权、封号（尤其多账号、批量、商业用途）。
- 小号试跑是社区普遍建议，但仍有风险。

### 5.4 隐私与法律边界（仅提示）
- **凭证安全**：Cookie / storage_state / state.json 等同账号密码，云方案上传到服务器有泄露风险；部分项目 data/ 已 gitignore，但云端传输仍需注意。
- **数据最小化**：读取聊天记录、通讯录属敏感个人信息，需明确告知与授权。
- **功能红线**：如 GiveMeFire 的"修改聊天记录"、xposed 的"群发/刷单"已明显越界，不建议模仿。
- **建议**：若做开源项目，README 必须明确"学习用途/个人自用/风险自负"，并避免提供绕过验证码、批量营销的能力。

---

## 六、现有项目"千篇一律"的雷同点

1. **目标同质**：几乎都是"每天自动发一条消息维持火花"，功能定义高度一致。
2. **技术同质**：Playwright + Cookie + GitHub Actions 是被复制最多的模板（2061360308 一个仓库就被 fork 出 4+ 个几乎一样的变种）。
3. **内容同质**：消息源清一色"一言/hitokoto 随机文案"或单个表情 🔥，再叠加"今日火花+1"式套话，依旧机械。
4. **交互同质**：都是"配置→定时→发送"，用户无感知、无参与、无反馈。
5. **形态同质**：要么 GitHub Actions 免费跑（受限排队/Cookie 过期），要么简单网页后台勾选好友——仪表盘普遍简陋。
6. **合规表述同质**：免责声明模板化，却仍默认"全自动发送"，未真正降低违规风险。
7. **协议混乱**：部分项目无 License（ys0801、Yuriz132、多个 Auto.js），AGPL 与商业收费混用（Douyin-mcp），对想正经开源/二开的用户不友好。
8. **容错薄弱**：验证码、登录态过期、UI 改版大多只能"人工重来"；鲜有自动恢复与健康检查（仅 Xiaowu、unmev 做了基础熔断/通知）。

---

## 七、差异化机会（给用户的方向建议）

> 核心思路：**不要在"更稳地自动发消息"上内卷，而在"更懂用户、更合规、更可插拔、更可视"上做文章。**

### 方向 A：合规优先的"提醒 + 半自动"模式（最推荐，风险最低）
- 不做"偷偷全自动发"，而是：到点**提醒你** + **帮你草拟好一条**个性化短消息 + 你点一下发送。
- 既解决"我总忘记续火花"的痛点，又基本不踩自动化发私信的违规红线。
- 定位语建议："火花守护助手，而不是续火机器人"。

### 方向 B：隐私优先 / 本地优先（Local-first）
- 凭证**本地加密存储**（不上云）、**零遥测**、**开源可审计**；对比 Yuriz132 等"上传凭证到云服务器"的方案形成鲜明卖点。
- 默认"安全模式"：限制每日发送人数、间隔随机化、频率上限，降低风控。

### 方向 C：跨平台 / 可插拔平台（Adapter 架构）
- 借鉴 dewhush/TikTok-Streak-API 的 REST 化思路：核心调度与"平台适配器"解耦，先支持抖音，后续可插拔微信/Telegram/qq 等。
- 把"续火花"抽象为"维持每日轻互动"，扩大适用面。

### 方向 D：拟人化 + 上下文感知（告别"今日火花+1"）
- 结合 LLM 或轻量模板引擎，按**时段/天气/纪念日/历史对话**生成短而像人的消息，而非随机名言。
- 内容可插拔数据源：天气 API、日历、RSS、用户自定义语料库（借鉴 Ummio/douyin_auto_sender 的天气思路但更泛化）。

### 方向 E：可视化仪表盘 + "连续天数"游戏化
- 借鉴 Jon2G/TiktokStreakSaver：火花日历、距熄灭倒计时、成功率环图、连续天数徽章。
- 把"别让火花断"做成有成就感的看板，而不只是个后台。

### 方向 F：强容错与可观测
- 验证码/登录态过期→**主动推送通知**让你来处理（而非静默失败）；发送前切人校验、发送后回读校验、失败自动补发、指数退避重试。
- 提供"自检/Dry Run"模式（unmev 已有雏形，可做标准）。

### 方向 G：干净的工程与协议
- 明确 MIT/AGPL 协议 + CONTRIBUTING + 透明的安全/合规说明；避免 Douyin-mcp 那种"开源+闭源收费"的观感争议。
- 清晰的 README：安装、架构图、风险告知、路线图。

### 方向 H：原生桌面/菜单栏应用
- 现有方案多为安卓(Auto.js)或网页；一个干净的 **macOS/Windows 菜单栏小应用**（常驻、轻量、本机运行）有差异化空间。

---

## 八、待向用户确认的开放问题（供后续需求澄清）

1. **合规底线**：你接受"全自动发送"方案，还是更倾向于"提醒+半自动（人工点发送）"的合规路线？这决定产品定位与风险等级。
2. **目标平台**：只做抖音，还是一开始就规划跨平台（微信/Telegram/TikTok）可插拔？
3. **运行形态**：本地桌面 App / 网页自托管 / GitHub Actions 免费跑 / 安卓 App，你更想要哪一种或哪几种？
4. **用户量级**：个人自用（几个~十几个好友），还是要支持多账号/多好友批量？（后者风控与合规风险陡增）
5. **内容策略**：消息用随机名言，还是希望"拟人化/上下文感知"（接入 LLM 或本地模板）？是否接受调用外部 API（如天气/大模型）？
6. **隐私取向**：能否接受凭证上云？还是必须坚持本地加密、零遥测？
7. **开源与协议**：是否公开上传 GitHub？希望什么 License（MIT/AGPL）？是否考虑商业化？
8. **技术栈偏好**：有无偏好语言（Python / TypeScript / Go / C#）？团队是否具备逆向/反检测经验？
9. **差异化侧重**：上述 A~H 方向里，你最想主打哪一个作为"不千篇一律"的卖点？
10. **验收标准**：如何定义"成功"——火花不熄灭天数？发送成功率？还是用户体验/_star 数？

---

## 九、给主理人的汇报摘要（200 字以内）

GitHub 上"抖音自动续火花"已明显内卷：主流方案几乎都是 Playwright 驱动抖音网页版 + Cookie 登录 + 每天定时发一条随机文案，仅 2061360308/DouYinSparkFlow 一个仓库就被 fork 出 4+ 个雷同变种；另有 Tampermonkey、Auto.js、Xposed（GiveMeFire）、逆向 API（cv-cat/DouYin_Spider，2563★）等路线。所有方案都绕不开 Cookie 过期、验证码、异地登录风控与封号风险，且多数自承违反抖音公约。雷同点集中在本质目标、技术方案、内容和交互。建议别在"更稳自动发"上卷，改做**合规半自动提醒、本地隐私优先、跨平台可插拔、拟人化内容、可视化仪表盘**等差异化方向——其中"提醒+半自动"风险最低、最易合规。

---

## 信息来源链接清单

**网页浏览器自动化（Playwright）**
- https://github.com/2061360308/DouYinSparkFlow
- https://github.com/Microst/DouYinSparkFlow
- https://github.com/Echozxc/DouYinSparkFlow
- https://github.com/Xiaowu-0916/douyin-spark
- https://github.com/Yuriz132/douyin-cloud-streak
- https://github.com/rD227/douyin-auto-spark
- https://github.com/bling-yshs/douyin-auto-spark
- https://github.com/unmev/douyin-auto-fire
- https://git.codeproxy.net/wzeffort/DouYinSparkFlow （镜像）
- https://frappe@github.com/molimi20/DouYinSparkFlow （镜像）

**浏览器用户脚本**
- https://github.com/ys0801/DouYinSpark

**安卓自动化（Auto.js）**
- https://github.com/xiaowang0715/DYAutoSpark
- https://github.com/Haven-Lv/autojs6-douyin-sendMessage
- https://gitee.com/awoo/auto-js6-tiktok-auto-spark

**Hook / 逆向 API**
- https://github.com/Xposed-Modules-Repo/me.yfishyon.fire （GiveMeFire）
- https://modules.lsposed.org/module/me.yfishyon.fire/
- https://github.com/cv-cat/DouYin_Spider
- https://github.com/6dlz/douyin-chat-export
- https://github.com/sanbap6537/xposed-aweme
- https://github.com/qfant/xposed-douyin

**AI Agent / MCP**
- https://github.com/Lozzi1910/Douyin-mcp
- https://juejin.cn/post/7646938869472804899 （Douyin MCP 介绍文）
- https://clawhub.ai/moroiser/douyin-messager
- https://clawhub.ai/grcdevil-art/douyin-auto-reply

**抖音私信/自动化周边**
- https://github.com/dtMILKYWAY/Douyin-sixinjiaoben
- https://github.com/Ummio/douyin_auto_sender
- https://www.ai-indeed.com/encyclopedia/30081.html （合规智能触达指南）

**TikTok 跨平台参考**
- https://github.com/Hungdiamond/tiktok-streak
- https://github.com/dewhush/TikTok-Streak-API
- https://github.com/thetrekir/TikTok-Streak-Bot
- https://github.com/Jon2G/TiktokStreakSaver
- https://github.com/eulfn/streak-tiktok
- https://github.com/DkoBot/TikTokAutoSparkWeb

**第三方数据/镜像**
- https://reporank.net/en/repo/bling-yshs-douyin-auto-spark.html
- https://reporank.net/en/repo/unmev-douyin-auto-fire.html
- https://tool.lu/library/3Zm （cv-cat/DouYin_Spider 数据）
