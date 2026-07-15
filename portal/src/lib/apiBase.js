/**
 * 统一的 API base 入口
 *
 * 优先级:
 *   1. 运行时 window.__APP_BASE__ + 'api'  (生产容器场景:由后端启动时根据 BASE_PATH env 注入到 index.html)
 *   2. 构建时 import.meta.env.VITE_API_URL  (本地 npm run dev 兼容旧用法)
 *   3. 兜底 '/api'
 *
 * 例:
 *   BASE_PATH=/         → window.__APP_BASE__='/'        → API_BASE='/api'
 *   BASE_PATH=/portal/  → window.__APP_BASE__='/portal/'  → API_BASE='/portal/api'
 *
 * 之所以做成函数而不是常量:HMR 替换模块时若 window.__APP_BASE__ 已变(罕见)能拿到新值
 */

function computeApiBase() {
  // 浏览器环境优先用运行时注入的 base
  if (typeof window !== 'undefined' && typeof window.__APP_BASE__ === 'string') {
    const raw = window.__APP_BASE__;
    // 占位符未被替换的兜底:开发场景 vite serve index.html 不走后端中间件
    if (raw && !raw.includes('__BASE_PATH__')) {
      // 保证「__APP_BASE__ 以 / 结尾」+ 「api 前不重复斜杠」
      const base = raw.endsWith('/') ? raw : raw + '/';
      return base + 'api';
    }
  }
  // dev / 构建时回退
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
}

export const API_BASE = computeApiBase();

// 路由 base:vue-router 的 createWebHistory(base) 用
export function getRouterBase() {
  if (typeof window !== 'undefined' && typeof window.__APP_BASE__ === 'string') {
    const raw = window.__APP_BASE__;
    if (raw && !raw.includes('__BASE_PATH__')) {
      return raw.endsWith('/') ? raw : raw + '/';
    }
  }
  return '/';
}

/**
 * 解码 JWT payload（不验证签名，仅用于读取 exp 等字段）
 */
export function parseJwt(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    // 补齐 base64 padding
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * 检查 JWT 是否已过期（提前 5 秒视为过期，避免竞态）
 */
export function isTokenExpired(token) {
  const payload = parseJwt(token)
  if (!payload || !payload.exp) return true // 无法解析视为过期
  return Date.now() / 1000 >= payload.exp - 5
}

/**
 * 统一登出：清除本地存储并跳转登录页
 */
export function logout(router) {
  localStorage.removeItem('token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('user')
  if (router) {
    router.push('/login')
  } else if (typeof window !== 'undefined') {
    window.location.href = (window.__APP_BASE__ || '/') + 'login'
  }
}
