<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const status = ref('正在登录...')
const isError = ref(false)

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

onMounted(async () => {
  const ticket = route.query.ticket
  const returnPath = route.query.return || '/profile'
  if (!ticket) {
    isError.value = true
    status.value = '登录链接缺少参数,请重新发起登录'
    return
  }
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    })
    const data = await res.json()
    if (!res.ok) {
      isError.value = true
      status.value = data.error || '登录失败,请重试'
      return
    }
    if (data.user.role === 'admin') {
      localStorage.removeItem('token')
      localStorage.setItem('admin_token', data.token)
    } else {
      localStorage.removeItem('admin_token')
      localStorage.setItem('token', data.token)
    }
    localStorage.setItem('user', JSON.stringify(data.user))
    sessionStorage.setItem('wecom_oauth_completed', '1')
    // 用全路径跳转(兼容企微客户端 webview, router.replace 可能不生效)
    const appBase = (window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__'))
      ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/')
      : '/'
    window.location.href = appBase + returnPath.replace(/^\//, '')
  } catch (err) {
    isError.value = true
    status.value = err.message || '网络错误'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div class="text-center">
      <p :class="isError ? 'text-red-500' : 'text-text-secondary'" class="text-sm">{{ status }}</p>
      <router-link v-if="isError" to="/login" class="inline-block mt-4 text-text underline text-sm">
        返回登录页
      </router-link>
    </div>
  </div>
</template>
