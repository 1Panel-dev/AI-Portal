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

            <!-- skillctl 指令使用说明 -->
            <div class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-3 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
                </svg>
                skillctl 指令使用说明
              </h3>
              <ol class="space-y-3 text-[14px] text-[#1d1d1f] leading-relaxed list-decimal pl-4 m-0">
                <li>
                  下载并安装 skillctl（按平台），详见
                  <a href="/docs?chapter=skillctl" target="_blank" class="text-accent underline underline-offset-2 hover:opacity-80">在线文档 → skillctl 命令行说明</a>。
                </li>
                <li>
                  登录 1Panel 并配置本地 Skill 安装目录（首次使用）：
                  <div class="mt-1.5 space-y-1">
                    <code class="block text-[13px] font-mono text-[#1d1d1f] bg-[#f5f5f7] rounded-lg px-3 py-1.5">skillctl login &lt;1Panel地址&gt; --token &lt;API-Key&gt;</code>
                    <code class="block text-[13px] font-mono text-[#1d1d1f] bg-[#f5f5f7] rounded-lg px-3 py-1.5">skillctl agent create default --skills-path &lt;本地skills目录&gt;</code>
                  </div>
                </li>
                <li>
                  安装 <strong class="text-[#1d1d1f]">{{ skill.title }}</strong> 技能：
                  <code class="block mt-1.5 text-[13px] font-mono text-[#1d1d1f] bg-[#f5f5f7] rounded-lg px-3 py-1.5">skillctl install {{ skill.slug }}</code>
                </li>
              </ol>
            </div>

            <!-- 最新版下载地址：仅在无版本历史时展示（有版本列表时，每条已自带下载） -->
            <div v-if="!versionsLoading && versions.length === 0" class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-2.5 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载地址（最新版本）
              </h3>
              <div class="flex items-center gap-2">
                <code class="text-[13px] font-mono text-[#1d1d1f] break-all min-w-0 flex-1 bg-[#f5f5f7] rounded-lg px-3 py-2">{{ downloadPath }}</code>
                <a href="#" @click.prevent="checkAuth(latestDownloadUrl)" class="shrink-0 px-3 py-2 text-[12px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors no-underline">下载</a>
              </div>
            </div>

            <!-- 版本历史 -->
            <div class="mb-8">
              <h3 class="text-[13px] font-semibold text-[#1d1d1f] mb-3 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
                </svg>
                版本历史
              </h3>
              <div v-if="versionsLoading" class="text-[13px] text-[#aeaeb2] py-2">加载中...</div>
              <div v-else-if="versions.length === 0" class="text-[13px] text-[#aeaeb2] py-2">暂无版本信息</div>
              <div v-else class="border border-[#e8e8ed] rounded-xl overflow-hidden">
                <div
                  v-for="(v, idx) in versions"
                  :key="v.version"
                  class="flex items-center gap-3 px-4 py-3 text-[13px]"
                  :class="[idx !== versions.length - 1 ? 'border-b border-[#f0f0f2]' : '', v.isLatest ? 'bg-[#f5f9ff]' : '']"
                >
                  <span class="font-mono font-semibold text-[#1d1d1f] min-w-[60px]">{{ v.version }}</span>
                  <span
                    class="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    :class="versionBadgeClass(v)"
                  >{{ versionLabel(v) }}</span>
                  <a
                    href="#"
                    @click.prevent="checkAuth(`${API_BASE}/skills/${skill.slug}/download?v=${encodeURIComponent(v.version)}`)"
                    class="shrink-0 px-2.5 py-1 text-[11px] font-medium bg-accent text-white rounded-md hover:bg-accent-hover transition-colors no-underline"
                  >下载</a>
                  <span class="text-[#aeaeb2] flex-1 text-right text-[12px]">{{ formatDate(v) }}</span>
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
import { useRoute, useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import { avatarColors, categoryLabels } from '../data/categories.js'
import { useSkills } from '../composables/useSkills.js'

const route = useRoute()
const router = useRouter()
const { getSkillBySlug } = useSkills()

function isTokenValid() {
  const token = localStorage.getItem('token')
  if (!token) return false
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    return Date.now() < payload.exp * 1000
  } catch { return false }
}

async function checkAuth(url) {
  const token = localStorage.getItem('token')
  if (!isTokenValid()) {
    router.push('/login')
    return
  }
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      localStorage.removeItem('token')
      router.push('/login')
      return
    }
    if (!res.ok) { console.error('下载失败:', res.status); return }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const filename = `${skill.value?.slug || 'skill'}.zip`
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (e) { console.error('下载失败:', e) }
}

const skill = ref(null)
const loading = ref(true)
const error = ref(null)
const versions = ref([])
const versionsLoading = ref(false)

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const avatarColor = computed(() => {
  return avatarColors[skill.value?.avatarColor] || { bg: '#e0f2f1', text: '#00695c' }
})

// 下载地址:相对路径用于展示,完整 URL 用于实际下载
const downloadPath = computed(() => skill.value ? `/api/skills/${skill.value.slug}/download` : '')
const latestDownloadUrl = computed(() => skill.value ? `${API_BASE}/skills/${skill.value.slug}/download` : '')

const versionLabel = (v) => {
  if (v.status === 'published') return '已发布'
  if (v.status === 'approved') return '已审核'
  if (v.status === 'rejected') return '已驳回'
  return v.status || '未知'
}

const versionBadgeClass = (v) => {
  if (v.status === 'published') return 'bg-emerald-50 text-emerald-700'
  if (v.status === 'approved') return 'bg-blue-50 text-blue-600'
  if (v.status === 'rejected') return 'bg-red-50 text-red-500'
  return 'bg-[#f0f0f2] text-[#86868b]'
}

const formatDate = (v) => {
  const d = v.publishedAt || v.createdAt
  if (!d) return ''
  try {
    const dt = new Date(d)
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  } catch { return '' }
}

const loadVersions = async () => {
  if (!skill.value) return
  versionsLoading.value = true
  try {
    const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(skill.value.slug)}/versions`)
    const json = await res.json()
    const data = Array.isArray(json?.data) ? json.data : []
    // 过滤掉没有 version 字段的脏数据
    versions.value = data.filter(v => v && v.version)
  } catch (e) {
    versions.value = []
  } finally {
    versionsLoading.value = false
  }
}

const loadSkill = async () => {
  loading.value = true
  error.value = null

  try {
    const result = await getSkillBySlug(route.params.slug)
    if (result) {
      skill.value = result
      loadVersions()
    } else {
      error.value = '技能不存在'
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(loadSkill)

// Reload if route param changes
watch(() => route.params.slug, loadSkill)
</script>
