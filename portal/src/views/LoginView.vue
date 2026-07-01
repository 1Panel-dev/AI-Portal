<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[400px] mx-auto px-6 pt-[160px] pb-20 animate-fade-up">
      <!-- 企微客户端内自动登录:显示 loading,不渲染表单,避免页面闪现 -->
      <div v-if="autoRedirecting" class="text-center py-20">
        <p class="text-text-secondary text-sm">正在登录...</p>
      </div>

      <template v-else>
      <div class="text-center mb-8">
        <h1 class="text-[28px] font-bold text-text tracking-[-0.5px] mb-2">登录</h1>
        <p class="text-text-secondary text-sm">登录 1Panel AI 门户</p>
      </div>

      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text mb-2">用户名</label>
          <input
            v-model="username"
            type="text"
            class="w-full px-4 py-3 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
            placeholder="请输入用户名"
          >
        </div>

        <div class="mb-5">
          <label class="block text-sm font-medium text-text mb-2">密码</label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              @keyup.enter="login"
              class="w-full px-4 py-3 pr-11 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
              placeholder="请输入密码"
            >
            <button
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <svg v-if="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <button
          @click="login"
          :disabled="!username || !password || loading"
          class="w-full py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <p v-if="error" class="mt-4 text-sm text-red-500 text-center">{{ error }}</p>

        <!-- OAuth 登录按钮 -->
        <div v-if="oauthEnabled" class="mt-6">
          <div class="relative flex items-center my-4">
            <div class="flex-grow border-t border-[rgba(0,0,0,0.06)]"></div>
            <span class="px-3 text-xs text-text-secondary">或使用以下方式登录</span>
            <div class="flex-grow border-t border-[rgba(0,0,0,0.06)]"></div>
          </div>
          <div class="flex flex-col gap-2">
            <button
              v-for="p in oauthProviders" :key="p.provider"
              @click="p.provider === 'wecom' ? startWecomLogin() : null"
              class="w-full px-4 py-2.5 text-sm bg-white border border-[rgba(0,0,0,0.08)] rounded-lg hover:border-text transition-all"
            >
              {{ p.display_name }} 登录
            </button>
          </div>
        </div>

        <p v-if="!oauthEnabled" class="mt-5 text-sm text-text-secondary text-center">
          还没有账号？
          <router-link to="/register" class="text-text font-medium hover:underline">立即注册</router-link>
        </p>
      </div>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

// 与 API_BASE 相同逻辑但返回根路径(不带 /api),用于跳转 /profile 等操作
function getAppBase() {
  if (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__')) {
    const raw = window.__APP_BASE__
    return raw.endsWith('/') ? raw : raw + '/'
  }
  return '/'
}

const router = useRouter()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

const oauthProviders = ref([])

// 企微客户端内自动跳转时,不渲染登录表单,只显示 loading
const autoRedirecting = ref(false)

const oauthEnabled = computed(() => oauthProviders.value.length > 0)

async function loadOauthProviders() {
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/providers`)
    const data = await res.json()
    oauthProviders.value = data.providers || []
  } catch (err) {
    console.warn('[LoginView] 加载 OAuth providers 失败:', err)
    oauthProviders.value = []
  }
}

function isInsideWecomUA() {
  return /wxwork|micromessenger/i.test(navigator.userAgent || '')
}

async function maybeAutoLoginInsideWecom() {
  if (!isInsideWecomUA()) return
  // 立即隐藏登录表单,显示 loading,避免页面闪现
  autoRedirecting.value = true
  // 企微客户端内每次进入登录页都重新走静默授权，不能复用上一位用户的本地 token
  sessionStorage.removeItem('wecom_oauth_completed')
  localStorage.removeItem('token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('user')
  const hasWecom = oauthProviders.value.some(p => p.provider === 'wecom')
  if (!hasWecom) {
    autoRedirecting.value = false   // 企微未启用,恢复显示登录表单
    return
  }
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/wecom/url?return=/profile`)
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else autoRedirecting.value = false
  } catch (err) {
    console.warn('[LoginView] 企微内自动跳转失败:', err)
    autoRedirecting.value = false
  }
}

// 直接跳转到企微登录页(98152 文档章节 2:构造企业微信登录链接)
// 用户扫码后,企微会带 code+state 跳回我们的 callback
async function startWecomLogin() {
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/wecom/url?return=/profile`)
    const data = await res.json()
    if (!data.url) {
      error.value = '获取企业微信登录地址失败'
      return
    }
    window.location.href = data.url
  } catch (err) {
    console.error('[LoginView] 启动企微登录失败:', err)
    error.value = '启动企业微信登录失败'
  }
}

onMounted(async () => {
  await loadOauthProviders()
  await maybeAutoLoginInsideWecom()
})

const login = async () => {
  if (!username.value || !password.value) return

  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || '登录失败')
    }

    // 根据角色存储不同的 token
    if (data.user.role === 'admin') {
      localStorage.setItem('admin_token', data.token)
    } else {
      localStorage.setItem('token', data.token)
    }
    localStorage.setItem('user', JSON.stringify(data.user))

    // 根据角色跳转到不同页面
    if (data.user.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/profile')
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>
