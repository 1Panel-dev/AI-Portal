<template>
  <div
    class="bg-white rounded-card border border-[rgba(0,0,0,0.04)] p-6 cursor-pointer transition-all duration-300 ease-out flex flex-col hover:-translate-y-0.5 hover:border-[rgba(10,132,255,0.22)] hover:shadow-[0_16px_40px_rgba(10,132,255,0.10)]"
    :style="{ animationDelay: `${0.05 + index * 0.05}s` }"
    @click="$emit('click')"
  >
    <!-- Header: Icon + Title -->
    <div class="flex items-start gap-3.5 mb-3">
      <div
        class="w-11 h-11 rounded-[13px] flex items-center justify-center text-lg font-bold shrink-0"
        :style="{ background: avatarColor.bg, color: avatarColor.text }"
      >
        {{ skill.avatar }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <div class="text-[15px] font-semibold text-text leading-tight truncate">{{ skill.title }}</div>
          <!-- 来源标签:1Panel 技能给个明显的标识(高风险/中风险 tag 已移除,改为顶部 source 过滤器) -->
          <span
            v-if="skill.source === 'panel'"
            class="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded border border-blue-200"
            title="来自 1Panel skills-hub"
          >1Panel</span>
        </div>
        <div class="text-[11px] text-text-tertiary mt-0.5">{{ skill.version }}</div>
      </div>
    </div>

    <!-- Description -->
    <p class="text-[13px] text-text-secondary leading-relaxed line-clamp-2 mb-4 flex-1">
      {{ skill.description }}
    </p>

    <!-- 安装操作:下载 / skillctl 两个等大小按钮,保持卡片底部轻盈 -->
    <div class="flex items-center gap-2 mb-3">
      <a
        href="#"
        @click.stop.prevent="checkAuth"
        class="flex-1 flex items-center justify-center gap-1.5 h-8 bg-surface-secondary text-text rounded-lg text-[12px] font-medium no-underline transition-colors duration-150 hover:bg-black/[0.06]"
        title="下载技能包(zip)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        下载
      </a>
      <button
        @click.stop="copyAgentCommand"
        class="shrink-0 w-8 h-8 bg-surface-secondary text-text-secondary rounded-lg cursor-pointer flex items-center justify-center transition-colors duration-150 hover:bg-black/[0.06] hover:text-text"
        title="复制 skillctl 安装命令(需先登录 skillctl)"
      >
        <svg v-if="copied" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between pt-3 border-t border-[rgba(0,0,0,0.04)]">
      <div class="flex items-center gap-1 text-xs text-text-secondary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        {{ formatDownloads(skill.downloads) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { avatarColors } from '../data/categories.js'

const router = useRouter()

function isTokenValid() {
  const token = localStorage.getItem('token')
  if (!token) return false
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    return Date.now() < payload.exp * 1000
  } catch { return false }
}

async function checkAuth() {
  const token = localStorage.getItem('token')
  if (!isTokenValid()) {
    router.push('/login')
    return
  }
  const url = `${API_BASE}/skills/${props.skill.slug}/download`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      // token 过期或无效
      localStorage.removeItem('token')
      router.push('/login')
      return
    }
    if (!res.ok) { console.error('下载失败:', res.status); return }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${props.skill.slug}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (e) { console.error('下载失败:', e) }
}

const props = defineProps({
  skill: { type: Object, required: true },
  index: { type: Number, default: 0 },
})

defineEmits(['click'])

const copied = ref(false)

// 与 SkillDetailModal 一致的 API_BASE 取法:优先用后端注入的 APP_BASE,fallback 到 /api
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

// 直接下载最新版本 zip 的链接

const avatarColor = computed(() => {
  return avatarColors[props.skill.avatarColor] || { bg: '#e0f2f1', text: '#00695c' }
})

const formatDownloads = (num) => {
  if (!num) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toString()
}

const copyAgentCommand = async () => {
  // 只复制纯安装命令;前置步骤(下载/登录/配置)在详情页 skillctl 说明里给出
  const cmd = `skillctl install ${props.skill.slug}`
  try {
    await navigator.clipboard.writeText(cmd)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>
