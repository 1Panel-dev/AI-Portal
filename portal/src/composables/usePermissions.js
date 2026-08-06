// portal/src/composables/usePermissions.js
// 前端权限状态管理（Phase 1：纯状态，不接入 AdminLayout 菜单控制）
//
// 数据来源：GET /api/my/permissions -> { permissions:[...], is_portal_admin, roles }
// 兜底：接口不可用（404/网络异常）时，若本地有 admin_token 则视为超管（is_portal_admin=true），
//       保证后台页面在 /api/my/permissions 异常时仍可访问。
//
// Phase 2 才接入 AdminLayout 菜单显隐 / 按钮禁用；Phase 1 仅提供 can() 供页面按需调用。
import { ref, computed } from 'vue'
import { API_BASE, isTokenExpired } from '../lib/apiBase'

export const permissions = ref([])
export const isPortalAdmin = ref(false)
export const roles = ref([])

export async function loadPermissions() {
  const token = localStorage.getItem('admin_token') || localStorage.getItem('token')
  if (!token) {
    permissions.value = []
    isPortalAdmin.value = false
    roles.value = []
    return
  }
  try {
    const res = await fetch(`${API_BASE}/my/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
      // 每次请求都去服务器验证,不读浏览器缓存(避免旧权限导致判定错乱)
      cache: 'no-cache',
    })
    // 304 时 res.ok 为 false,但 res.json() 可读取缓存 body
    if (!res.ok && res.status !== 304) throw new Error(String(res.status))
    const data = await res.json()
    permissions.value = data.permissions || []
    isPortalAdmin.value = !!data.is_portal_admin
    roles.value = data.roles || []
  } catch (e) {
    // 接口异常时不覆盖 permissions(保留上次成功加载的值),避免闪退
    // 仅兜底: admin_token 未过期时视为超管(保证后台可访问)
    const adminToken = localStorage.getItem('admin_token')
    if (adminToken && !isTokenExpired(adminToken)) {
      isPortalAdmin.value = true
      if (!permissions.value.length) permissions.value = []
    }
  }
}

export function can(key) {
  if (isPortalAdmin.value) return true
  return permissions.value.includes(key)
}

// 管理类权限位清单(用于判断是否显示「管理后台」入口)
// 只含操作权限:进入后台需能实际执行某操作;菜单权限(menu:admin-*)只控制
// 侧边栏单项可见性,不应单独授予进入后台的能力(否则进去每页 403)
export const ADMIN_PERMS = [
  'role:view','role:create','role:edit','role:delete',
  'group:view','group:create','group:edit','group:delete',
  'user:view','user:edit','user:create','user:delete',
  'skill:edit','skill:delete','system:config',
]

// 是否显示「管理后台」入口:超管或持有任一管理权限位
// isPortalAdmin/admin_token 短路保证超管首屏不闪(权限未加载完也返 true)
export const showAdminEntry = computed(() => {
  if (isPortalAdmin.value) return true
  // 残留的 admin_token 若已过期则不应给入口(否则点进去被守卫踢回造成"闪退")
  const adminToken = localStorage.getItem('admin_token')
  if (adminToken && !isTokenExpired(adminToken)) return true
  return ADMIN_PERMS.some(k => permissions.value.includes(k))
})
