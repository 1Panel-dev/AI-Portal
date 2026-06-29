<template>
  <div>
    <NavBar />

    <main class="max-w-[960px] mx-auto px-6 py-[92px] pb-20">
      <div class="flex items-end justify-between gap-4 mb-7">
        <div>
          <h1 class="text-[30px] font-bold text-text tracking-[-0.4px]">我的技能</h1>
          <p class="text-sm text-text-secondary mt-1">查看你提交的技能审核状态</p>
        </div>
        <router-link v-if="featureFlags.skillSubmitEnabled" to="/submit" class="px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-accent-hover transition-colors no-underline">
          提交技能
        </router-link>
      </div>

      <SkillctlGuide :flags="featureFlags" class="mb-7" />

      <div v-if="loading" class="bg-white border border-[rgba(0,0,0,0.04)] rounded-xl p-10 text-center text-sm text-text-secondary shadow-card">
        加载中...
      </div>

      <div v-else-if="skills.length === 0" class="bg-white border border-[rgba(0,0,0,0.04)] rounded-xl p-10 text-center shadow-card">
        <p class="text-base font-semibold text-text mb-2">还没有提交过技能</p>
        <p class="text-sm text-text-secondary mb-5">提交后可以在这里查看审核进度</p>
        <router-link v-if="featureFlags.skillSubmitEnabled" to="/submit" class="inline-flex px-4 py-2 text-sm font-medium bg-text text-white rounded-lg hover:bg-accent-hover transition-colors no-underline">
          去提交
        </router-link>
      </div>

      <div v-else class="bg-white border border-[rgba(0,0,0,0.04)] rounded-xl overflow-hidden shadow-card">
        <div class="grid grid-cols-[1.5fr_110px_110px_120px] gap-4 px-5 py-3 text-xs font-medium text-text-tertiary border-b border-[rgba(0,0,0,0.06)]">
          <span>技能</span>
          <span>版本</span>
          <span>状态</span>
          <span>提交时间</span>
        </div>
        <div v-for="skill in skills" :key="skill.id" class="grid grid-cols-[1.5fr_110px_110px_120px] gap-4 px-5 py-4 border-b border-[rgba(0,0,0,0.05)] last:border-b-0 items-center">
          <div class="min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <p class="font-semibold text-text truncate">{{ skill.title }}</p>
              <router-link v-if="skill.status === 'approved'" :to="`/skill/${skill.slug}`" class="text-xs text-text-secondary hover:text-text no-underline shrink-0">查看</router-link>
            </div>
            <p class="text-xs text-text-tertiary mt-1 truncate">{{ skill.skill_id }} · {{ skill.category }} · {{ skill.author }}</p>
            <p v-if="skill.status === 'rejected' && skill.review_note" class="text-xs text-[#c2410c] mt-1 truncate">{{ skill.review_note }}</p>
          </div>
          <span class="text-sm font-mono text-text-secondary">{{ skill.version || 'v1.0.0' }}</span>
          <span class="inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium" :class="statusClass(skill.status)">{{ statusText(skill.status) }}</span>
          <span class="text-sm text-text-secondary">{{ formatDate(skill.submitted_at) }}</span>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import SkillctlGuide from '../components/SkillctlGuide.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()
const loading = ref(true)
const skills = ref([])
const featureFlags = ref({ skillSubmitEnabled: false, skillctlDocUrl: '' })

const statusText = (status) => ({
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}[status] || status)

const statusClass = (status) => ({
  pending: 'bg-[#fff7ed] text-[#9a3412]',
  approved: 'bg-[#ecfdf5] text-[#047857]',
  rejected: 'bg-[#fef2f2] text-[#b91c1c]',
}[status] || 'bg-surface-secondary text-text-secondary')

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

const loadFeatureFlags = async () => {
  try {
    const res = await fetch(`${API_BASE}/config/feature-flags`)
    if (res.ok) featureFlags.value = await res.json()
  } catch (e) { console.warn('loadFeatureFlags failed:', e) }
}

const loadSkills = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/my/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      router.push({ path: '/login', query: { redirect: '/my-skills' } })
      return
    }
    const data = await res.json()
    skills.value = data.data || []
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadSkills(); loadFeatureFlags() })
</script>
