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

const DEFAULT_SITE_NAME = 'AI门户'
// site_logo 为空时的兜底:用 1panel-logo.svg(宽幅,带 1Panel 图标+文字)。
// 后台管理员仍可单独上传 logo 覆盖。
const DEFAULT_SITE_LOGO = '/1panel-logo.svg'

// 首屏初值:优先用后端注入到 index.html 的 window.__SITE_BRANDING__
// (站名/logo/favicon 已 resolve 成完整 URL),避免刷新时先闪默认值再 fetch 回填。
// 注入值缺失(本地 dev 由 vite 插件填默认 JSON, 或注入失败)则回退默认值, 再由 loadSiteBranding fetch。
const injected = (typeof window !== 'undefined' && window.__SITE_BRANDING__) || {}
export const siteName    = ref(injected.site_name || DEFAULT_SITE_NAME)
// 是否在用默认 logo:默认 1panel-logo.svg 走内联 mask 渲染(可被 CSS 改成主题蓝);
// 管理员上传的 logo 用 <img> 原样显示。
export const siteLogoIsDefault = ref(!injected.site_logo)
export const siteLogo    = ref(injected.site_logo ? resolveAssetUrl(injected.site_logo) : resolveAssetUrl(DEFAULT_SITE_LOGO))
export const siteFavicon = ref(injected.site_favicon || '')

let loaded = false
export async function loadSiteBranding() {
  if (loaded) return
  loaded = true
  try {
    const res = await fetch(`${API_BASE}/site/branding`)
    if (!res.ok) return
    const data = await res.json()
    siteName.value    = data.site_name    || DEFAULT_SITE_NAME
    siteLogoIsDefault.value = !data.site_logo
    siteLogo.value    = data.site_logo    ? resolveAssetUrl(data.site_logo) : resolveAssetUrl(DEFAULT_SITE_LOGO)
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
