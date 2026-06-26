<template>
  <div class="relative z-10 min-h-screen bg-[#f5f5f7]">
    <NavBar />

    <main class="max-w-[720px] mx-auto px-6 pt-24 pb-16">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-[#86868b]">
        加载中...
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20 text-[#e53935]">
        {{ error }}
      </div>

      <!-- Skill Detail -->
      <div v-else-if="skill">
        <!-- Back Navigation -->
        <button
          @click="$router.back()"
          class="mb-8 flex items-center gap-1.5 text-[13px] text-[#86868b] hover:text-[#1d1d1f] transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          返回
        </button>

        <!-- Header -->
        <div class="flex items-start gap-5 mb-8">
          <div
            class="w-[60px] h-[60px] rounded-[16px] flex items-center justify-center text-[26px] font-bold shrink-0"
            :style="{ background: avatarColor.bg, color: avatarColor.text }"
          >
            {{ skill.avatar }}
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[32px] font-bold text-[#1d1d1f] tracking-[-0.5px] leading-tight m-0">
              {{ skill.title }}
            </h1>
            <div class="flex items-center gap-2.5 mt-2 text-[13px] text-[#86868b]">
              <span class="px-2.5 py-[3px] bg-[#f0f0f2] rounded-lg text-[12px]">{{ categoryLabels[skill.category] || skill.category }}</span>
              <span>by <strong class="text-[#1d1d1f]">{{ skill.author }}</strong></span>
            </div>
          </div>
        </div>

        <!-- Content Card -->
        <div class="bg-white rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div class="p-8">

            <!-- Description -->
            <div class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-2.5 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
                简介
              </h3>
              <p class="text-[14px] text-[#6e6e73] leading-relaxed whitespace-pre-wrap m-0">{{ skill.description }}</p>
            </div>

            <!-- AI Agent Prompt -->
            <div class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-2.5 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
                </svg>
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
              <p class="text-[12px] text-[#86868b] mb-2.5">
                复制以下指令发送给 AI Agent，自动完成安装
              </p>
              <div class="relative group">
                <pre class="text-[12px] font-mono text-[#1d1d1f] whitespace-pre-wrap leading-relaxed bg-[#f5f5f7] rounded-[12px] p-4 pr-16 border border-[rgba(0,0,0,0.04)] m-0">{{ agentPrompt }}</pre>
                <button
                  @click="copyAgentPrompt"
                  class="absolute top-3 right-3 px-3 py-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white text-[#86868b] text-[12px] cursor-pointer transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[#f0f0f2] hover:text-[#1d1d1f]"
                  :class="{ 'opacity-100': agentCopied }"
                >
                  <span v-if="agentCopied" class="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    已复制
                  </span>
                  <span v-else>复制指令</span>
                </button>
              </div>
            </div>

            <!-- Install URL -->
            <div v-if="skill.installUrl" class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-2.5 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                下载地址（最新版本）
              </h3>
              <a
                :href="skill.installUrl"
                target="_blank"
                class="text-[14px] text-[#1d1d1f] underline underline-offset-2 break-all hover:text-[#6e6e73] transition-colors"
              >
                {{ skill.installUrl }}
              </a>
            </div>

            <!-- Version History -->
            <div v-if="versions.length > 0" class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-2.5 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                版本历史
              </h3>
              <div class="space-y-2">
                <div
                  v-for="(v, idx) in versions"
                  :key="v.version"
                  class="flex items-center justify-between py-2.5 px-3.5 rounded-[10px] text-[13px]"
                  :class="idx === 0 ? 'bg-[#f0f0f2] border border-[rgba(0,0,0,0.06)]' : 'bg-[#f9f9fb]'"
                >
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono font-semibold text-[#1d1d1f]">{{ v.version }}</span>
                    <span
                      v-if="idx === 0"
                      class="text-[10px] font-semibold px-2 py-[2px] rounded-md bg-[#1d1d1f] text-white"
                    >最新</span>
                    <span class="text-[12px] text-[#86868b]">{{ formatDate(v.created_at) }}</span>
                  </div>
                  <a
                    v-if="v.file_path"
                    :href="`${API_BASE}/skills/${skill.slug}/download?v=${encodeURIComponent(v.version)}`"
                    class="px-3 py-1 text-[11px] font-medium bg-text text-white rounded-lg hover:bg-accent-hover transition-colors"
                  >下载</a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Not Found -->
      <div v-else class="text-center py-20 text-[#aeaeb2]">
        技能不存在
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import { avatarColors, categoryLabels } from '../data/categories.js'
import { useSkills } from '../composables/useSkills.js'

const route = useRoute()
const { getSkillBySlug } = useSkills()

const skill = ref(null)
const loading = ref(true)
const error = ref(null)
const agentCopied = ref(false)
const versions = ref([])
const selectedPlatform = ref('universal')
const platforms = [
  { id: 'universal', label: '通用', cmd: '' },
  { id: 'openclaw', label: 'OpenClaw', cmd: '-p openclaw' },
  { id: 'workbuddy', label: 'WorkBuddy', cmd: '-p workbuddy' },
]

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const avatarColor = computed(() => {
  return avatarColors[skill.value?.avatarColor] || { bg: '#e0f2f1', text: '#00695c' }
})

const agentPrompt = computed(() => {
  if (!skill.value) return ''
  const p = platforms.find(x => x.id === selectedPlatform.value)
  const flag = p?.cmd ? ` ${p.cmd}` : ''
  return `如果尚未安装 Skill 安装 CLI，请先执行：npm install -g @fitskill/f2chub-cli\n\n然后执行以下命令安装 ${skill.value.title} 技能：\n\nf2c skill install${flag} ${skill.value.slug}`
})

const loadSkill = async () => {
  loading.value = true
  error.value = null

  try {
    const result = await getSkillBySlug(route.params.slug)
    if (result) {
      skill.value = result
      loadVersions(result.slug)
    } else {
      error.value = '技能不存在'
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const loadVersions = async (slug) => {
  try {
    const res = await fetch(`${API_BASE}/skills/${slug}/versions`)
    if (res.ok) {
      versions.value = await res.json()
    }
  } catch {
    // silent
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const copyAgentPrompt = async () => {
  try {
    await navigator.clipboard.writeText(agentPrompt.value)
    agentCopied.value = true
    setTimeout(() => { agentCopied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

onMounted(loadSkill)

// Reload if route param changes
watch(() => route.params.slug, loadSkill)
</script>
