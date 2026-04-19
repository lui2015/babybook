# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder

WORKDIR /app

# 利用缓存：先拷贝依赖清单
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# 拷贝源码并构建
COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM nginx:1.27-alpine

# 自定义 nginx 配置（SPA 路由回退 + gzip）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
