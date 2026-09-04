# ============================================================
# 多阶段构建：构建前端 → 运行后端（tsx 直接跑 TS，免 tsc 产物）
# ============================================================

# ---- 阶段 1：构建前端 ----
FROM node:22-bookworm-slim AS web-builder
WORKDIR /app
# 仅复制前端依赖清单以利用缓存
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm install --no-audit --no-fund
COPY web/ ./web/
RUN cd web && npm run build

# ---- 阶段 2：运行环境 ----
# WORKDIR 必须是 /app/server：后端是独立 npm 包，依赖装在 server/node_modules，
# 启动命令 `node --import tsx` 需从包目录解析 tsx；若 WORKDIR=/app 会报
# ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'（与 server/package.json 的 start 脚本对齐）。
FROM node:22-bookworm-slim AS runner
WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3000

# 系统依赖：Playwright(Chromium) 运行所需；ca-certificates 供 HTTPS 请求
# 说明：基础镜像必须用 node:22 —— better-sqlite3@13 改用 prebuildify 分发，
# 预编译二进制随 npm 包内置于 prebuilds/ 且要求 Node>=22，无需 build-essential/Python。
# 可选构建参数 APT_MIRROR：网络受限时换国内 apt 镜像加速（默认空=官方源），
#   例：docker build --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn .
ARG APT_MIRROR=""
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 后端依赖（COPY 左侧源路径相对构建上下文，右侧目标相对 WORKDIR=/app/server）
COPY server/package.json server/package-lock.json* ./
# --ignore-scripts 必需：干净环境按 lock 还原时，npm 会对含 binding.gyp 的 better-sqlite3
# 自动跑 node-gyp rebuild（不读它的 gypfile:false），slim 镜像无 Python 必挂；
# 而它是 prebuildify 包，prebuilds/ 解压即用、本就不需要安装脚本。
# 已逐一验证跳脚本后 better-sqlite3/express/tsx/esbuild/zod/pino/node-cron 全部正常；
# playwright 浏览器由下方 `npx playwright install` 显式安装。
# ⚠️ 若未来引入必须靠 postinstall 才能用的生产依赖，需重新评估此参数。
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

# ---- Playwright + Chromium ----
# playwright 声明在 server/package.json 的 optionalDependencies（^1.62.1），
# 上面 `npm install --omit=dev` 已按 package-lock.json 锁定安装 1.62.1。
# 这里再显式装一遍是兜底：optional 依赖若拉取失败，npm 不会中断构建，
# 避免容器里「静默缺 playwright」导致抖音模式登录后报错。
# ⚠️ 版本号必须与 package.json / package-lock.json 保持一致（当前 1.62.1，
#    与本地真机验证的版本一致）；日后升 playwright 时两处必须同步改。
# --ignore-scripts：跳过 playwright postinstall 的自动下载，浏览器统一由下一行显式安装（幂等、可控）
RUN npm install playwright@1.62.1 --ignore-scripts --no-audit --no-fund
# 浏览器默认从官方 CDN 下载；网络受限时可经 playwright 原生参数指定镜像主机：
#   docker build --build-arg PLAYWRIGHT_DOWNLOAD_HOST=<host> .
# （--with-deps 同时用 apt 装 Chromium 系统库，会一并受上方 APT_MIRROR 加速）
ARG PLAYWRIGHT_DOWNLOAD_HOST=""
RUN npx playwright install --with-deps chromium \
  && rm -rf /root/.npm/_cacache /root/.cache/ms-playwright/*.tar.gz

# 后端源码
COPY server/ ./
# 用构建好的前端静态资源填充 public/
# 注意：web/vite.config.ts 的 outDir 是 ../server/public，故产物在 web-builder 的 /app/server/public
COPY --from=web-builder /app/server/public ./public

# 数据卷挂载点（运行时生成，gitignore）
VOLUME ["/data"]
ENV DATA_DIR=/data

EXPOSE 3000

# 使用 tsx 直接运行 TypeScript 入口（cwd=/app/server，与本地 npm start 一致）
CMD ["node", "--import", "tsx", "src/index.ts"]
