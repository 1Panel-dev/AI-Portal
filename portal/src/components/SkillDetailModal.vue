<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-[8px] z-[200] flex items-center justify-center p-5"
      @click="closeOnOverlay"
    >
      <div
        class="bg-white rounded-modal w-full max-w-[640px] max-h-[85vh] overflow-hidden shadow-modal relative animate-modal-in"
        @click.stop
      >
        <!-- Close button -->
        <button
          @click="close"
          class="absolute top-5 right-5 w-8 h-8 rounded-full border-none bg-surface-secondary text-text-secondary cursor-pointer flex items-center justify-center transition-colors hover:bg-[#e8e8ed] z-10 text-base"
        >
          ✕
        </button>

        <!-- Header -->
        <div class="p-8 pb-0 flex items-start gap-4">
          <div
            class="w-14 h-14 rounded-[14px] flex items-center justify-center text-2xl font-bold shrink-0"
            :style="{ background: avatarColor.bg, color: avatarColor.text }"
          >
            {{ skill.avatar }}
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-[22px] font-bold text-text tracking-[-0.3px]">{{ skill.title }}</h2>
            <div class="flex items-center gap-2 mt-1.5 text-[13px] text-text-secondary">
              <span class="px-2.5 py-[3px] bg-surface-secondary rounded-xl text-xs">{{ categoryLabels[skill.category] || skill.category }}</span>
              <span>by <strong class="text-text">{{ skill.author }}</strong></span>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="p-8 overflow-y-auto max-h-[calc(85vh-100px)]">
          <!-- Description -->
          <div class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              简介
            </h3>
            <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{{ skill.description }}</p>
          </div>

          <!-- AI Agent -->
          <div class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
              AI Agent 安装指令
            </h3>
            <!-- Platform Tabs -->
            <div class="flex gap-1.5 mb-3">
              <button
                v-for="p in platforms"
                :key="p.id"
                @click="selectedPlatform = p.id"
                class="px-3 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all"
                :class="selectedPlatform === p.id
                  ? 'border border-[#1d1d1f] text-[#1d1d1f] bg-white'
                  : 'border border-[#e0e0e0] text-[#86868b] bg-white hover:border-[#86868b]'"
              >{{ p.label }}</button>
            </div>
            <p class="text-xs text-text-secondary mb-2.5">复制以下指令发送给 AI Agent，自动完成安装</p>
            <div class="relative group">
              <pre class="text-xs font-mono text-text whitespace-pre-wrap leading-relaxed bg-surface-secondary rounded-xl p-4 pr-14 border border-[rgba(0,0,0,0.04)]">{{ agentPrompt }}</pre>
              <button
                @click="copyAgentPrompt"
                class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white text-text-secondary text-xs cursor-pointer transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-secondary hover:text-text"
                :class="{ 'opacity-100': agentCopied }"
              >
                {{ agentCopied ? '✓ 已复制' : '复制' }}
              </button>
            </div>
          </div>

          <!-- Download URL -->
          <div v-if="skill.installUrl" class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              下载地址（最新版本）
            </h3>
            <a :href="skill.installUrl" target="_blank" class="text-sm text-text underline underline-offset-2 break-all hover:text-text-secondary">
              {{ skill.installUrl }}
            </a>
          </div>

          <!-- Version History -->
          <div v-if="versions.length > 0" class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              版本历史
            </h3>
            <div class="space-y-2">
              <div
                v-for="(v, idx) in versions"
                :key="v.version"
                class="flex items-center justify-between py-2.5 px-3.5 rounded-[10px] text-[13px]"
                :class="idx === 0 ? 'bg-[#f0f0f2] border border-[rgba(0,0,0,0.06)]' : 'bg-surface-secondary'"
              >
                <div class="flex items-center gap-2.5">
                  <span class="font-mono font-semibold text-text">{{ v.version }}</span>
                  <span v-if="idx === 0" class="text-[10px] font-semibold px-2 py-[2px] rounded-md bg-text text-white">最新</span>
                  <span class="text-xs text-text-secondary">{{ v.date }}</span>
                </div>
                <a v-if="v.file_path" :href="`${API_BASE}/skills/${skill.slug}/download?v=${encodeURIComponent(v.version)}`" class="px-3 py-1 text-[11px] font-medium bg-text text-white rounded-lg hover:bg-accent-hover transition-colors">下载</a>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-8 py-4 border-t border-[rgba(0,0,0,0.04)] bg-[rgba(245,245,247,0.5)] flex justify-end">
          <button
            @click="close"
            class="px-6 py-2 rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white text-text text-sm font-medium cursor-pointer transition-all hover:bg-surface-secondary"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { avatarColors, categoryLabels } from '../data/categories.js'

const props = defineProps({
  skill: { type: Object, default: null },
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const agentCopied = ref(false)
const versions = ref([])
const selectedPlatform = ref('universal')
const platforms = [
  { id: 'universal', label: '通用', cmd: '' },
  { id: 'openclaw', label: 'OpenClaw', cmd: '-p openclaw' },
  { id: 'workbuddy', label: 'WorkBuddy', cmd: '-p workbuddy' },
]

const avatarColor = computed(() => {
  return avatarColors[props.skill?.avatarColor] || { bg: '#e0f2f1', text: '#00695c' }
})

const agentPrompt = computed(() => {
  if (!props.skill) return ''
  const p = platforms.find(x => x.id === selectedPlatform.value)
  const flag = p?.cmd ? ` ${p.cmd}` : ''
  return `如果尚未安装 Skill 安装 CLI，请先执行：npm install -g @fitskill/f2chub-cli\n\n然后执行以下命令安装 ${props.skill.title} 技能：\n\nf2c skill install${flag} ${props.skill.slug}`
})

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const loadVersions = async (slug) => {
  try {
    const res = await fetch(`${API_BASE}/skills/${slug}/versions`)
    if (res.ok) versions.value = await res.json()
  } catch { /* silent */ }
}

watch(() => props.isOpen, (open) => {
  if (open && props.skill) loadVersions(props.skill.slug)
})

const close = () => emit('close')
const closeOnOverlay = (e) => { if (e.target === e.currentTarget) close() }

const copyAgentPrompt = async () => {
  try {
    await navigator.clipboard.writeText(agentPrompt.value)
    agentCopied.value = true
    setTimeout(() => { agentCopied.value = false }, 2000)
  } catch (err) { console.error('Failed to copy:', err) }
}
</script>
