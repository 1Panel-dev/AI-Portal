// portal/src/composables/usePermissions.js
// 前端权限状态管理（Phase 1：纯状态，不接入 AdminLayout 菜单控制）
//
// 数据来源：GET /api/my/permissions -> { permissions:[...], is_portal_admin, roles }
// 兜底：接口不可用（404/网络异常）时，若本地有 admin_token 则视为超管（is_portal_admin=true），
//       保证后台页面在 /api/my/permissions 异常时仍可访问。
//
// Phase 2 才接入 AdminLayout 菜单显隐 / 按钮禁用；Phase 1 仅提供 can() 供页面按需调用。
import { ref, computed } from 'vue'
import { API_BASE, isTokenExpired, clearAuth, getLoginToken } from '../lib/apiBase'

export const permissions = ref([])
export const isPortalAdmin = ref(false)
export const roles = ref([])

// 当前登录身份类别（用于校验角色是否被变更）
// superadmin=超管 / adminRole=后台角色(有 menu:admin-*) / user=普通用户
function currentIdentity() {
  if (isPortalAdmin.value) return 'superadmin'
  return permissions.value.some(k => k.startsWith('menu:admin-')) ? 'adminRole' : 'user'
}

// 校验当前身份与登录时是否一致;角色被重新授权(如管理员->普通用户)则强制退出重新登录
// 每次 loadPermissions 成功(刷新/切页都会重新拉权限)后对比 sessionStorage 里登录时记录的类别。
function checkIdentityChange() {
  const identity = currentIdentity()
  const prev = sessionStorage.getItem('login_identity')
  if (!prev) {
    // 首次(登录后首次拉权限)记录基线
    sessionStorage.setItem('login_identity', identity)
    return
  }
  if (prev !== identity) {
    console.warn(`[permissions] 角色已变更(${prev} -> ${identity}), 强制重新登录`)
    clearAuth()
    // 整页跳登录页(刷新后路由守卫已因 token 清除跳到 /login)
    window.location.href = (window.__APP_BASE__ || '/') + 'login'
  }
}

// 并发去重: 进任意页面时 NavBar/AdminLayout 与页面自身会同时调 loadPermissions(),
// 共享同一个在途请求, 避免 /api/my/permissions 每次进页面被打两次。
// 只合并在途请求(按 token 区分), 完成后再次调用会重新拉取——不影响「切页重新校验身份」语义。
let inflightPromise = null
let inflightToken = null
export function loadPermissions() {
  const token = getLoginToken()
  if (inflightPromise && inflightToken === token) return inflightPromise
  inflightToken = token
  inflightPromise = doLoadPermissions().finally(() => { inflightPromise = null; inflightToken = null })
  return inflightPromise
}

async function doLoadPermissions() {
  const token = getLoginToken()
  if (!token) {
    permissions.value = []
    isPortalAdmin.value = false
    roles.value = []
    sessionStorage.removeItem('login_identity')
    return
  }
  try {
    const res = await fetch(`${API_BASE}/my/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
      // 每次请求都去服务器验证,不读浏览器缓存(避免旧权限导致判定错乱)
      cache: 'no-cache',
    })
    // 304 时 res.ok 为 false,但 res.json() 可读取缓存 body
    if (!res.ok && res.status !== 304) {
      // 401 = token 确认失效(换容器/过期): 清 token 跳登录, 不能带着死 token 卡在页面里
      if (res.status === 401) {
        console.warn('[permissions] token 已失效(401), 清除登录态跳转登录页')
        clearAuth()
        window.location.href = (window.__APP_BASE__ || '/') + 'login'
        throw new Error('401')
      }
      throw new Error(String(res.status))
    }
    const data = await res.json()
    const count = (data.permissions || []).length
    console.log(`[permissions] 加载成功, 权限数: ${count}, is_portal_admin: ${!!data.is_portal_admin}, 角色: ${(data.roles||[]).join(',')}`)
    permissions.value = data.permissions || []
    isPortalAdmin.value = !!data.is_portal_admin
    roles.value = data.roles || []
    // 身份一致性校验:角色被变更(降级/升级)则强制退出重新登录
    checkIdentityChange()
  } catch (e) {
    console.warn(`[permissions] 加载失败: ${e.message}, 保留旧权限(${permissions.value.length}条)`)
    // 接口异常时不覆盖 permissions(保留上次成功加载的值),避免闪退
    // 仅兜底: 当前身份是超管(login_token_type='admin')且 admin_token 未过期时视为超管,
    // 保证后台可访问; 普通用户即使残留 admin_token 也不会被误判为超管
    const adminToken = localStorage.getItem('admin_token')
    if (adminToken && !isTokenExpired(adminToken) && localStorage.getItem('login_token_type') === 'admin') {
      isPortalAdmin.value = true
      if (!permissions.value.length) permissions.value = []
    }
  }
}

export function can(key) {
  if (isPortalAdmin.value) return true
  return permissions.value.includes(key)
}

// 用户是否是后台角色(有 menu:admin-* 菜单权限)
export const isAdminRoleUser = computed(() => {
  if (isPortalAdmin.value) return true
  return permissions.value.some(k => k.startsWith('menu:admin-'))
})

// 管理类权限位清单(用于判断是否显示「管理后台」入口)
// 只含操作权限:进入后台需能实际执行某操作;菜单权限(menu:admin-*)只控制
// 侧边栏单项可见性,不应单独授予进入后台的能力(否则进去每页 403);注意: model:view 是广场查看权限不入此列
// (普通前台角色几乎都有 model:view, 误列会让所有人被误判为有后台入口)
export const ADMIN_PERMS = [
  'role:view','role:create','role:edit','role:delete',
  'group:view','group:create','group:edit','group:delete',
  'user:view','user:edit','user:create','user:delete','user:password','user:batch-password','user:assign',
  'skill:edit','skill:delete','skill:publish','skill:review','group:panel-sync','system:config',
  'tag:view','tag:create','tag:edit','tag:delete','model:edit',
  'invocation_format:view','invocation_format:create','invocation_format:edit','invocation_format:delete',
]

// 是否显示「管理后台」入口:超管或持有任一管理权限位
// 不信任残留 admin_token——用户角色已切为普通用户时,localStorage 里遗留的有效 admin_token
// 会误判成管理员(显示管理入口 + 登录自动跳后台)。超管由 is_portal_admin 兜底:
//   - loadPermissions 成功时返回 is_portal_admin=true
//   - loadPermissions 失败(接口异常)时,下方 catch 里用未过期 admin_token 置 isPortalAdmin=true
// 故此处无需再直接判断 admin_token。
export const showAdminEntry = computed(() => {
  if (isPortalAdmin.value) return true
  return permissions.value.some(k => k.startsWith('menu:admin-')) || ADMIN_PERMS.some(k => permissions.value.includes(k))
})
