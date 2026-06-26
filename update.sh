#!/bin/bash

# AI-Portal 强制更新脚本
# 在服务器上执行此脚本

echo "=== 停止并删除旧容器 ==="
docker-compose down

echo "=== 删除本地旧镜像 ==="
docker rmi swr.cn-north-4.myhuaweicloud.com/maxkb/ai-portal:latest -f

echo "=== 强制拉取最新镜像 ==="
docker pull swr.cn-north-4.myhuaweicloud.com/maxkb/ai-portal:latest

echo "=== 启动新容器 ==="
docker-compose up -d

echo "=== 等待启动 ==="
sleep 3

echo "=== 验证文件 ==="
docker exec ai-portal-app ls -la /app/dist/assets/

echo "=== 查看日志 ==="
docker-compose logs --tail 20
