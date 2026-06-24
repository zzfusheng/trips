# ============ 构建阶段 ============
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./

# 安装生产依赖
RUN npm ci --omit=dev

# ============ 运行阶段 ============
FROM node:18-alpine

WORKDIR /app

# 确保全局 node_modules 目录可写
RUN mkdir -p /usr/local/lib/node_modules && chmod -R 777 /usr/local/lib/node_modules

# 从构建阶段复制依赖
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY . .

# 安装 flyai-cli 到全局
RUN npm install -g @fly-ai/flyai-cli

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://8.153.15.245:3000/api/health || exit 1

CMD ["node", "index.js"]
