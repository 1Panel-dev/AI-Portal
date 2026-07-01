<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[400px] mx-auto px-6 pt-[160px] pb-20 animate-fade-up">
      <div class="text-center mb-8">
        <h1 class="text-[28px] font-bold text-text tracking-[-0.5px] mb-2">注册</h1>
        <p class="text-text-secondary text-sm">创建 AI-Portal 门户账号</p>
      </div>

      <div v-if="checking" class="text-center py-12 text-text-secondary text-sm">
        加载中...
      </div>
      <div v-else-if="registerDisabled" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card text-center">
        <h2 class="text-xl font-semibold text-text mb-3">自助注册已关闭</h2>
        <p class="text-sm text-text-secondary mb-6">
          系统已启用第三方账号登录。请使用第三方账号登录，或联系管理员开通账号。
        </p>
        <router-link to="/login"
          class="inline-block px-5 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover">
          去登录
        </router-link>
      </div>
      <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text mb-1">显示名</label>
          <input
            v-model="name"
            type="text"
            class="w-full px-4 py-3 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
            placeholder="如：张三"
          >
          <p class="mt-1 text-xs text-text-tertiary">显示名用于前端展示，支持中文，不填则默认显示用户名</p>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text mb-1">用户名</label>
          <input
            v-model="username"
            type="text"
            class="w-full px-4 py-3 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
            placeholder="3-30位英文或数字，用于登录"
          >
          <p v-if="username && !/^[a-zA-Z0-9_]+$/.test(username)" class="mt-1 text-xs text-red-500">用户名只能包含英文、数字和下划线</p>
          <p v-else-if="username && (username.length < 3 || username.length > 30)" class="mt-1 text-xs text-red-500">用户名需3-30位字符</p>
          <p v-else class="mt-1 text-xs text-text-tertiary">用户名仅限英文、数字和下划线，不支持中文</p>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text mb-2">密码</label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="w-full px-4 py-3 pr-11 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
              placeholder="6位以上密码"
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

        <div class="mb-5">
          <label class="block text-sm font-medium text-text mb-2">确认密码</label>
          <input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            @keyup.enter="register"
            class="w-full px-4 py-3 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
            placeholder="再次输入密码"
          >
          <p v-if="confirmPassword && password !== confirmPassword" class="mt-1 text-xs text-red-500">两次密码不一致</p>
        </div>

        <button
          @click="register"
          :disabled="!canSubmit || loading"
          class="w-full py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ loading ? '注册中...' : '注册' }}
        </button>

        <p v-if="error" class="mt-4 text-sm text-red-500 text-center">{{ error }}</p>

        <p class="mt-5 text-sm text-text-secondary text-center">
          已有账号？
          <router-link to="/login" class="text-text font-medium hover:underline">立即登录</router-link>
        </p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const name = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const registerDisabled = ref(false)
const checking = ref(true)

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/providers`)
    const data = await res.json()
    registerDisabled.value = (data.providers || []).length > 0
  } catch (e) {
    registerDisabled.value = false
  } finally {
    checking.value = false
  }
})

const canSubmit = computed(() =>
  /^[a-zA-Z0-9_]+$/.test(username.value) &&
  username.value.length >= 3 && username.value.length <= 30 &&
  password.value.length >= 6 &&
  password.value === confirmPassword.value
)

const register = async () => {
  if (!canSubmit.value) return

  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        password: password.value,
        name: name.value || username.value,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || '注册失败')
    }

    // Auto-login after registration
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    router.push('/profile')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>
