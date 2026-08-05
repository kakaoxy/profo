# ---- Stage 1: deps ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app
# pnpm >=11 从 pnpm-workspace.yaml 读取 onlyBuiltDependencies 等配置，必须一并拷贝
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# --ignore-scripts: Docker 构建无需 native 构建脚本（esbuild/sharp/unrs-resolver），
# Next.js 自带 esbuild 二进制，sharp 仅运行时需要（standalone 输出不包含）
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- Stage 2: builder ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 构建时注入 SERVER_API_URL，让 next.config.ts 的 rewrites 在 build 阶段拿到正确值
# （Next.js rewrites 在 build 时评估，运行时环境变量对它无效）
# 默认值用于本地 dev；Docker 部署通过 docker-compose.yml build args 覆盖为 http://backend:8000
ARG SERVER_API_URL=http://127.0.0.1:8000
ENV SERVER_API_URL=${SERVER_API_URL}
# 构建时注入 PRODUCTION_DOMAIN，让 next.config.ts 的 serverActions.allowedOrigins
# 在 build 阶段拿到生产域名（Next.js config 在 build 时评估）
# 缺失时若反代导致 Host/Origin 不一致，Server Actions 会被拒
ARG PRODUCTION_DOMAIN=
ENV PRODUCTION_DOMAIN=${PRODUCTION_DOMAIN}
RUN pnpm build

# ---- Stage 3: runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nextjs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
