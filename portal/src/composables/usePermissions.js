// portal/src/composables/usePermissions.js
// 前端权限状态管理（Phase 1：纯状态，不接入 AdminLayout 菜单控制）
//
// 数据来源：GET /api/my/permissions -> { permissions:[...], is_portal_admin, roles }
// 兜底：接口不可用（404/网络异常）时，若本地有 admin_token 则视为超管（is_portal_admin=true），
//       保证后台页面在 /api/my/permissions 异常时仍可访问。
//
// Phase 2 才接入 AdminLayout 菜单显隐 / 按钮禁用；Phase 1 仅提供 can() 供页面按需调用。
import { ref, computed } from 'vue'
import { API_BASE } from '../lib/apiBase'

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
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    permissions.value = data.permissions || []
    isPortalAdmin.value = !!data.is_portal_admin
    roles.value = data.roles || []
  } catch (e) {
    // 兜底：接口不可用时，仅有 admin_token 视为超管（保证后台可访问）
    if (localStorage.getItem('admin_token')) {
      isPortalAdmin.value = true
      permissions.value = []
    } else {
      isPortalAdmin.value = false
      permissions.value = []
    }
  }
}

export function can(key) {
  if (isPortalAdmin.value) return true
  return permissions.value.includes(key)
}

// 管理类权限位清单(用于判断是否显示「管理后台」入口)
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
  if (localStorage.getItem('admin_token')) return true
  return ADMIN_PERMS.some(k => permissions.value.includes(k))
})
