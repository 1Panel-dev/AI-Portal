<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[400px] mx-auto px-6 py-20 pt-[160px]">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-text mb-2">管理员登录</h1>
        <p class="text-text-secondary text-sm">1Panel AI 门户 技能审核后台</p>
      </div>

      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-lg">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text mb-2">用户名</label>
          <input
            v-model="username"
            type="text"
            @keyup.enter="login"
            class="w-full px-4 py-3 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
            placeholder="请输入管理员用户名"
          >
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text mb-2">密码</label>
          <input
            v-model="password"
            type="password"
            @keyup.enter="login"
            class="w-full px-4 py-3 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-text outline-none focus:border-[#86868b] transition-all"
            placeholder="请输入管理员密码"
          >
        </div>

        <button
          @click="login"
          :disabled="!username || !password || loading"
          class="w-full py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <p v-if="error" class="mt-4 text-sm text-red-500 text-center">{{ error }}</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

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

    // 保存 token
    localStorage.setItem('admin_token', data.token)
    router.push('/admin')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>
