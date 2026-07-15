import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
import { getRouterBase, isTokenExpired } from './lib/apiBase.js'

// 首屏直出：模型广场是默认首页，eager 加载避免一次额外的网络往返
import ModelsView from './views/ModelsView.vue'

// 其余视图按需懒加载，由 Vite 自动 code-split
const routes = [
  { path: '/', component: ModelsView, meta: { public: true } },
  { path: '/models', redirect: '/' },
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
  { path: '/admin', component: () => import('./views/AdminView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/skills', component: () => import('./views/AdminSkillsView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/users', component: () => import('./views/AdminUsersView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/config', component: () => import('./views/AdminConfigView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/oauth', component: () => import('./views/AdminOAuthView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/stats', component: () => import('./views/AdminStatsView.vue'), meta: { requiresAuth: true } },
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
    localStorage.removeItem('token')
    localStorage.removeItem('admin_token')
    localStorage.removeItem('user')
    return next({ path, query: to.path !== '/' ? { redirect: to.fullPath } : {} })
  }

  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('admin_token')
    if (!token) return next('/admin/login')
    if (isTokenExpired(token)) return clearAndRedirect('/admin/login')
  }
  if (to.meta.requiresUserAuth) {
    if (isInsideWecomUA()) {
      if (sessionStorage.getItem('wecom_oauth_completed') === '1') {
        sessionStorage.removeItem('wecom_oauth_completed')
        wecomOauthAllowed = true
      } else if (!wecomOauthAllowed) {
        localStorage.removeItem('token')
        localStorage.removeItem('admin_token')
        localStorage.removeItem('user')
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
