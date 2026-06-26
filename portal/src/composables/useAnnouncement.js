// 公告横幅 + 首次访问 dialog 全局 store
// - banner: 顶部蓝色滚动条
// - dialog: 居中详细对话框,带「不再提示」记忆
// - dialog_version 每次 admin 保存自增,localStorage key 携带 vN,
//   admin 改完所有用户自动重新看到 dialog(即使之前点过「不再提示」)
import { ref } from 'vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__')
  ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api'
  : (import.meta.env.VITE_API_URL || '/api'))

export const bannerEnabled = ref(false)
export const bannerHtml    = ref('')
export const dialogEnabled = ref(false)
export const dialogTitle   = ref('')
export const dialogHtml    = ref('')
export const dialogVersion = ref(1)

let loaded = false
export async function loadAnnouncement() {
  if (loaded) return
  loaded = true
  try {
    const res = await fetch(`${API_BASE}/site/announcement`)
    if (!res.ok) return
    const data = await res.json()
    bannerEnabled.value = data.banner_enabled !== false
    bannerHtml.value    = data.banner_html    || ''
    dialogEnabled.value = data.dialog_enabled !== false
    dialogTitle.value   = data.dialog_title   || ''
    dialogHtml.value    = data.dialog_html    || ''
    dialogVersion.value = parseInt(data.dialog_version || '1', 10)
  } catch (e) {
    console.warn('加载公告失败:', e)
  }
}

// 用 version 拼出 localStorage key, admin 保存后 version 自增, 老 key 自动失效
export function dismissDialogKey() {
  return `aiportal_announcement_dismissed_v${dialogVersion.value}`
}
