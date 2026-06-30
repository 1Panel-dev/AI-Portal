# 多阶段构建：构建前端 + 安装后端依赖 + 构建 skillctl + 运行时镜像

# ---- 阶段 1: 构建前端 ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/portal

COPY portal/package.json portal/package-lock.json ./
RUN npm ci

COPY portal/index.html portal/vite.config.js portal/tailwind.config.js portal/postcss.config.js ./
COPY portal/src ./src
COPY portal/public ./public

ENV VITE_API_URL=/api
RUN npm run build

# ---- 阶段 2: 安装后端生产依赖 ----
FROM node:20-alpine AS backend-deps
WORKDIR /app

RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev \
 && apk del .build-deps

# ---- 阶段 3: 构建 skillctl 下载产物 ----
FROM golang:1.22-alpine AS skillctl-builder
WORKDIR /app/skillctl

RUN apk add --no-cache make

COPY skillctl/go.mod skillctl/go.sum ./
RUN go mod download

COPY skillctl/ ./
RUN make release

# ---- 阶段 4: 运行时镜像 ----
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache tini

COPY --from=backend-deps /app/node_modules ./node_modules
COPY server/ ./
COPY --from=frontend-builder /app/portal/dist ./dist
COPY --from=skillctl-builder /app/skillctl/dist/ ./dist/downloads/

RUN mkdir -p /app/data/uploads/skills /app/data/uploads/branding

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_STATIC=true \
    STATIC_PATH=/app/dist \
    LOCAL_STORAGE_PATH=/app/data/uploads

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
