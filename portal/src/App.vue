<template>
  <div id="app" class="relative z-10">
    <AnnouncementModal />
    <router-view />
  </div>
</template>

<script setup>
import AnnouncementModal from './components/AnnouncementModal.vue'
import { loadSiteBranding } from './composables/useSiteBranding.js'
import { loadAnnouncement } from './composables/useAnnouncement.js'

// 启动时拉一次, 注入 document.title / favicon, 准备好横幅与对话框数据
loadSiteBranding()
loadAnnouncement()
</script>
