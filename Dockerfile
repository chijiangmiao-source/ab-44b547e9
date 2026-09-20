# syntax=docker/dockerfile:1

# ---------- 基础依赖层：安装全部依赖（含测试所需的 devDependencies） ----------
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 构建层：类型检查并产出静态页面 ----------
FROM base AS build
COPY . .
RUN npm run build

# ---------- 验收层：verify 服务，执行健康检查 + 求解器验收测试 ----------
FROM build AS verify
# 容器内通过 WEB_URL 访问 web 服务（Compose 中默认为 http://web:80）
ENV WEB_URL=http://web:80
CMD ["node", "verify/run.mjs"]

# ---------- 发布层：nginx 托管单页应用 ----------
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# 健康检查：/healthz 由 nginx 直接返回 200
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
EXPOSE 80
