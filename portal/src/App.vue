<template>
  <div id="app" class="relative z-10">
    <AnnouncementModal />
    <router-view />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AnnouncementModal from './components/AnnouncementModal.vue'
import { loadSiteBranding } from './composables/useSiteBranding.js'
import { loadAnnouncement } from './composables/useAnnouncement.js'
import { isTokenExpired, clearAuth } from './lib/apiBase.js'

// 启动时拉一次, 注入 document.title / favicon, 准备好横幅与对话框数据
loadSiteBranding()
loadAnnouncement()

// 定时检查 token 是否过期（每分钟一次）
const router = useRouter()
let expiryTimer = null

onMounted(() => {
  expiryTimer = setInterval(() => {
    // 在登录页不检查，避免空转
    const currentPath = router.currentRoute?.value?.path || ''
    if (currentPath === '/login' || currentPath === '/admin/login') return

    const token = localStorage.getItem('token')
    const adminToken = localStorage.getItem('admin_token')

    // 各自检查，各自跳对应登录页
    if (token && isTokenExpired(token)) {
      clearAuth()
      return router.push('/login')
    }
    if (adminToken && isTokenExpired(adminToken)) {
      clearAuth()
      return router.push('/admin/login')
    }
  }, 60_000)
})

onUnmounted(() => {
  if (expiryTimer) clearInterval(expiryTimer)
})
</script>
