import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
import { getRouterBase, isTokenExpired, clearAuth } from './lib/apiBase.js'

// 首屏直出：落地页是默认首页，eager 加载避免一次额外的网络往返
import LandingView from './views/LandingView.vue'

// 其余视图按需懒加载，由 Vite 自动 code-split
const routes = [
  {
    path: '/',
    component: LandingView,
    meta: { public: true },
  },
  { path: '/models', component: () => import('./views/ModelsView.vue'), meta: { public: true } },
  { path: '/skills', component: () => import('./views/HomeView.vue') },
  { path: '/mcp', component: () => import('./views/McpPlazaView.vue'), meta: { public: true } },
  { path: '/skill/:slug', component: () => import('./views/SkillDetailView.vue') },
  { path: '/submit', component: () => import('./views/SubmitSkillView.vue'), meta: { requiresUserAuth: true } },
  { path: '/my-skills', component: () => import('./views/MySkillsView.vue'), meta: { requiresUserAuth: true } },
  { path: '/docs', component: () => import('./views/DocsView.vue'), meta: { public: true } },
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/register', component: () => import('./views/RegisterView.vue'), meta: { public: true } },
  { path: '/oauth/complete', component: () => import('./views/OAuthCompleteView.vue'), meta: { public: true } },
  { path: '/oauth/error', component: () => import('./views/OAuthErrorView.vue'), meta: { public: true } },
  { path: '/oauth/bind', component: () => import('./views/OAuthBindView.vue'), meta: { public: true } },
  { path: '/profile', component: () => import('./views/ProfileView.vue'), meta: { requiresUserAuth: true } },
  { path: '/admin/login', component: () => import('./views/AdminLoginView.vue'), meta: { public: true } },
  {
    path: '/admin',
    component: () => import('./components/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('./views/AdminView.vue') },
      { path: 'skills', component: () => import('./views/AdminSkillsView.vue') },
      { path: 'users', component: () => import('./views/AdminUsersView.vue') },
      { path: 'config', component: () => import('./views/AdminConfigView.vue') },
      { path: 'oauth', component: () => import('./views/AdminOAuthView.vue') },
      { path: 'stats', component: () => import('./views/AdminStatsView.vue') },
      // RBAC Phase 1: 资源组 / 角色 / 1Panel授权信息 / 模型&MCP空壳
      // 守卫仍由父级 /admin 的 requiresAuth(admin_token) 统一兜底, 不改守卫逻辑
      { path: 'groups', component: () => import('./views/admin/ResourceGroupsView.vue') },
      { path: 'groups/:id', component: () => import('./views/admin/ResourceGroupEditView.vue') },
      { path: 'resource-assignments', component: () => import('./views/admin/ResourceAssignmentsView.vue') },
      { path: 'resource-assignments/:id', component: () => import('./views/admin/ResourceAssignmentEditView.vue') },
      { path: 'panel-groups', component: () => import('./views/admin/PanelGroupsView.vue') },
      { path: 'roles', component: () => import('./views/admin/RolesView.vue') },
      { path: 'models', component: () => import('./views/admin/AdminModelsView.vue') },
      { path: 'mcps', component: () => import('./views/admin/AdminMcpsView.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes,
})

function isInsideWecomUA() {
  return /wxwork/i.test(navigator.userAgent || '')
}

let wecomOauthAllowed = false

router.beforeEach((to, from, next) => {
  // 统一的过期清理：如果 token 过期，清除所有登录态并跳转登录页
  const clearAndRedirect = (path) => {
    clearAuth()
    return next({ path, query: to.path !== '/' ? { redirect: to.fullPath } : {} })
  }

  if (to.meta.requiresAuth) {
    const adminToken = localStorage.getItem('admin_token')
    const token = localStorage.getItem('token')
    if (!adminToken && !token) return next('/admin/login')
    // 两个 token 都查过期, 任一有效即放行
    const at = adminToken ? isTokenExpired(adminToken) : true
    const ut = token ? isTokenExpired(token) : true
    if (at && ut) return clearAndRedirect('/admin/login')
  }
  if (to.meta.requiresUserAuth) {
    if (isInsideWecomUA()) {
      if (sessionStorage.getItem('wecom_oauth_completed') === '1') {
        sessionStorage.removeItem('wecom_oauth_completed')
        wecomOauthAllowed = true
      } else if (!wecomOauthAllowed) {
        clearAuth()
        return next({ path: '/login', query: { redirect: to.fullPath } })
      }
    }
    const token = localStorage.getItem('token')
    if (!token) return next({ path: '/login', query: { redirect: to.fullPath } })
    if (isTokenExpired(token)) return clearAndRedirect('/login')
  }
  next()
})

createApp(App).use(router).mount('#app')
