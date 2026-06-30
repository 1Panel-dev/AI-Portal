// 站点品牌全局 store(单例)
// - 启动时调一次 fetch(), 把站点名注入 document.title、把 favicon 替换
// - NavBar 等组件直接 import 这个文件,用响应式 site_name / site_logo
// - admin 后台改完保存 5xx 缓存内不会立即同步,刷新即可

import { ref, watchEffect } from 'vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__')
  ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api'
  : (import.meta.env.VITE_API_URL || '/api'))

const APP_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__'))
  ? window.__APP_BASE__ : '/'

// /uploads/xx.png → <APP_BASE>uploads/xx.png; 外链原样返回
export function resolveAssetUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? APP_BASE.replace(/\/$/, '') + url : url
}

// 首屏初值:优先用后端注入到 index.html 的 window.__SITE_BRANDING__
// (站名/logo/favicon 已 resolve 成完整 URL),避免刷新时先闪默认值再 fetch 回填。
// 注入值缺失(本地 dev 由 vite 插件填默认 JSON, 或注入失败)则回退默认值, 再由 loadSiteBranding fetch。
const injected = (typeof window !== 'undefined' && window.__SITE_BRANDING__) || {}
export const siteName    = ref(injected.site_name || 'AI-Portal')
export const siteLogo    = ref(injected.site_logo || '') // 已 resolve 后的可用 URL,空表示用默认 SVG 占位
export const siteFavicon = ref(injected.site_favicon || '')

let loaded = false
export async function loadSiteBranding() {
  if (loaded) return
  loaded = true
  try {
    const res = await fetch(`${API_BASE}/site/branding`)
    if (!res.ok) return
    const data = await res.json()
    siteName.value    = data.site_name    || 'AI-Portal'
    siteLogo.value    = resolveAssetUrl(data.site_logo)
    siteFavicon.value = resolveAssetUrl(data.site_favicon)
  } catch (e) {
    console.warn('加载站点品牌失败,沿用默认值:', e)
  }
}

// 自动同步 document.title + favicon, 任何地方修改 siteName/siteFavicon 都会生效
if (typeof window !== 'undefined') {
  watchEffect(() => {
    if (siteName.value) document.title = siteName.value
  })
  watchEffect(() => {
    if (!siteFavicon.value) return
    let link = document.querySelector('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = siteFavicon.value
  })
}
