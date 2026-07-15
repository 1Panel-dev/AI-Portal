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
import { isTokenExpired } from './lib/apiBase.js'

// 启动时拉一次, 注入 document.title / favicon, 准备好横幅与对话框数据
loadSiteBranding()
loadAnnouncement()

// 定时检查 token 是否过期（每分钟一次）
const router = useRouter()
let expiryTimer = null

onMounted(() => {
  expiryTimer = setInterval(() => {
    const token = localStorage.getItem('token')
    const adminToken = localStorage.getItem('admin_token')
    const activeToken = token || adminToken
    if (activeToken && isTokenExpired(activeToken)) {
      localStorage.removeItem('token')
      localStorage.removeItem('admin_token')
      localStorage.removeItem('user')
      router.push('/login')
    }
  }, 60_000)
})

onUnmounted(() => {
  if (expiryTimer) clearInterval(expiryTimer)
})
</script>
