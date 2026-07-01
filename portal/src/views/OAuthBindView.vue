<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const ticket = route.query.ticket
const returnPath = route.query.return || '/profile'

const suggestedUsername = ref('')
const displayName = ref('')
const loadingPreview = ref(true)

const mode = ref('choose')   // choose | login | skip-confirm

const loginUsername = ref('')
const loginPassword = ref('')
const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  if (!ticket) {
    router.replace('/oauth/error?reason=state_invalid')
    return
  }
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/bind/preview-username?ticket=${encodeURIComponent(ticket)}`)
    const data = await res.json()
    if (res.ok) {
      suggestedUsername.value = data.suggested_username || ''
      displayName.value = data.display_name || ''
    }
  } catch (e) {
    console.warn('preview-username failed:', e)
  } finally {
    loadingPreview.value = false
  }
})

function setTokenAndGo(data) {
  if (data.user.role === 'admin') {
    localStorage.setItem('admin_token', data.token)
  } else {
    localStorage.setItem('token', data.token)
  }
  const target = data.auto_created
    ? `${returnPath}?welcome=1`
    : returnPath
  router.replace(target)
}

async function doLoginBind() {
  if (!loginUsername.value || !loginPassword.value) {
    error.value = '请输入用户名和密码'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/bind/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, username: loginUsername.value, password: loginPassword.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || '绑定失败'
      return
    }
    setTokenAndGo(data)
  } catch (e) {
    error.value = e.message || '网络错误'
  } finally {
    submitting.value = false
  }
}

async function doSkip() {
  submitting.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/bind/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || '创建失败'
      submitting.value = false
      return
    }
    setTokenAndGo(data)
  } catch (e) {
    error.value = e.message || '网络错误'
    submitting.value = false
  }
}

function cancel() {
  router.replace('/login')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface px-4">
    <div class="bg-white rounded-2xl shadow-xl p-8 w-[520px] max-w-full">
      <h2 class="text-xl font-semibold text-text mb-2">首次使用企业微信登录</h2>
      <p class="text-sm text-text-secondary mb-6">请选择一种方式继续</p>

      <!-- 三选项 -->
      <div v-if="mode === 'choose'" class="space-y-3">
        <button @click="mode = 'login'"
          class="w-full text-left px-5 py-4 border border-[rgba(0,0,0,0.08)] rounded-xl hover:border-text transition-all">
          <div class="font-medium text-text">绑定到已有账号</div>
          <div class="text-xs text-text-secondary mt-1">推荐:用您原有的账号登录后绑定企业微信</div>
        </button>
        <button @click="mode = 'skip-confirm'"
          class="w-full text-left px-5 py-4 border border-[rgba(0,0,0,0.08)] rounded-xl hover:border-text transition-all">
          <div class="font-medium text-text">使用企业微信信息创建新账号</div>
          <div class="text-xs text-text-secondary mt-1">
            将创建 <span class="font-mono">{{ loadingPreview ? '...' : suggestedUsername }}</span>,无需密码,后续可自行设置
          </div>
        </button>
        <button @click="cancel"
          class="w-full px-5 py-3 text-text-secondary text-sm hover:text-text transition-all">
          取消,返回登录页
        </button>
      </div>

      <!-- 登录绑定 -->
      <div v-else-if="mode === 'login'" class="space-y-3">
        <button @click="mode = 'choose'" class="text-xs text-text-secondary hover:text-text">← 返回</button>
        <input v-model="loginUsername" placeholder="用户名" type="text"
          class="w-full px-3 py-2.5 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text" />
        <input v-model="loginPassword" placeholder="密码" type="password" @keyup.enter="doLoginBind"
          class="w-full px-3 py-2.5 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text" />
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        <button @click="doLoginBind" :disabled="submitting"
          class="w-full px-4 py-2.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50">
          {{ submitting ? '处理中...' : '登录并绑定' }}
        </button>
      </div>

      <!-- 跳过确认 -->
      <div v-else-if="mode === 'skip-confirm'" class="space-y-4">
        <button @click="mode = 'choose'" class="text-xs text-text-secondary hover:text-text">← 返回</button>
        <div class="p-4 bg-surface-secondary rounded-xl">
          <p class="text-sm text-text mb-2">即将创建新账号:</p>
          <p class="font-mono text-base text-text">{{ suggestedUsername }}</p>
          <p v-if="displayName && displayName !== suggestedUsername" class="text-xs text-text-secondary mt-1">显示名:{{ displayName }}</p>
        </div>
        <p class="text-xs text-text-secondary">
          创建后您可立即登录,无需输入密码。建议进入个人中心后设置一个登录密码,以便日后从其他设备使用密码登录。
        </p>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        <button @click="doSkip" :disabled="submitting"
          class="w-full px-4 py-2.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50">
          {{ submitting ? '创建中...' : '确认创建并登录' }}
        </button>
      </div>
    </div>
  </div>
</template>
