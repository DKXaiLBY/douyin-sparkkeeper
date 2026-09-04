# ============================================================
# 多阶段构建：构建前端 → 运行后端（tsx 直接跑 TS，免 tsc 产物）
# ============================================================

# ---- 阶段 1：构建前端 ----
FROM node:20-bookworm-slim AS web-builder
WORKDIR /app
# 仅复制前端依赖清单以利用缓存
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm install --no-audit --no-fund
COPY web/ ./web/
RUN cd web && npm run build

# ---- 阶段 2：运行环境 ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 系统依赖：Playwright(Chromium) 运行所需；ca-certificates 供 HTTPS 请求
# 说明：better-sqlite3 在 node:20-bookworm-slim 上有预编译二进制，无需 build-essential
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 后端依赖
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

# ---- Playwright + Chromium ----
# playwright 声明在 server/package.json 的 optionalDependencies（^1.62.1），
# 上面 `npm install --omit=dev` 已按 package-lock.json 锁定安装 1.62.1。
# 这里再显式装一遍是兜底：optional 依赖若拉取失败，npm 不会中断构建，
# 避免容器里「静默缺 playwright」导致抖音模式登录后报错。
# ⚠️ 版本号必须与 package.json / package-lock.json 保持一致（当前 1.62.1，
#    与本地真机验证的版本一致）；日后升 playwright 时两处必须同步改。
RUN cd server && npm install playwright@1.62.1 --no-audit --no-fund
RUN cd server && npx playwright install --with-deps chromium \
  && rm -rf /root/.npm/_cacache /root/.cache/ms-playwright/*.tar.gz

# 后端源码
COPY server/ ./server/
# 用构建好的前端静态资源填充 public/
# 注意：web/vite.config.ts 的 outDir 是 ../server/public，故产物在 /app/server/public
COPY --from=web-builder /app/server/public ./server/public

# 数据卷挂载点（运行时生成，gitignore）
VOLUME ["/data"]
ENV DATA_DIR=/data

EXPOSE 3000

# 使用 tsx 直接运行 TypeScript 入口
CMD ["node", "--import", "tsx", "server/src/index.ts"]
