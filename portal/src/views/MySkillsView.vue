<template>
  <div>
    <NavBar />

    <main class="max-w-[960px] mx-auto px-6 py-[92px] pb-20">
      <div class="flex items-end justify-between gap-4 mb-7">
        <div>
          <h1 class="text-[30px] font-bold text-text tracking-[-0.4px]">我的技能</h1>
          <p class="text-sm text-text-secondary mt-1">查看你提交的技能审核状态</p>
        </div>
        <button v-if="canSubmit" @click="showSubmitDialog = true" class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">
          提交技能
        </button>
      </div>

      <div v-if="loading" class="bg-white border border-[rgba(0,0,0,0.04)] rounded-xl p-10 text-center text-sm text-text-secondary shadow-card">
        加载中...
      </div>

      <div v-else-if="skills.length === 0" class="bg-white border border-[rgba(0,0,0,0.04)] rounded-xl p-10 text-center shadow-card">
        <p class="text-base font-semibold text-text mb-2">还没有提交过技能</p>
        <p class="text-sm text-text-secondary mb-5">提交后可以在这里查看审核进度</p>
        <button v-if="canSubmit" @click="showSubmitDialog = true" class="inline-flex px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">
          去提交
        </button>
      </div>

      <div v-else class="bg-white border border-[rgba(0,0,0,0.04)] rounded-xl overflow-hidden shadow-card">
        <div class="grid grid-cols-[1.5fr_90px_90px_110px_150px] gap-4 px-5 py-3 text-xs font-medium text-text-tertiary border-b border-[rgba(0,0,0,0.06)]">
          <span>技能</span>
          <span>版本</span>
          <span>状态</span>
          <span>提交时间</span>
          <span class="text-right">操作</span>
        </div>
        <div v-for="skill in skills" :key="skill.id" class="grid grid-cols-[1.5fr_90px_90px_110px_150px] gap-4 px-5 py-4 border-b border-[rgba(0,0,0,0.05)] last:border-b-0 items-center">
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
          <div class="flex items-center justify-end gap-2">
            <button v-if="skill.status === 'pending'" @click="showSubmitDialog = true" class="px-2.5 py-1 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">替换</button>
            <button v-if="skill.status === 'pending'" @click="confirmWithdraw(skill)" class="px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">撤销</button>
          </div>
        </div>

        <div v-if="totalPages > 1" class="flex items-center justify-between px-5 py-3 border-t border-[rgba(0,0,0,0.06)] text-sm text-text-secondary">
          <span class="text-[13px]">共 {{ total }} 条</span>
          <div class="flex items-center gap-2">
            <button @click="goPage(page - 1)" :disabled="page <= 1" class="w-8 h-8 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">‹</button>
            <span class="text-[13px]">{{ page }} / {{ totalPages }}</span>
            <button @click="goPage(page + 1)" :disabled="page >= totalPages" class="w-8 h-8 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">›</button>
          </div>
        </div>
      </div>
    </main>

    <SubmitSkillDialog :open="showSubmitDialog" @close="showSubmitDialog = false" @submitted="onSkillSubmitted" />

    <AppDialog :open="!!withdrawTarget" title="撤销提交" type="confirm"
      :message="`确定撤销「${withdrawTarget?.title || ''}」吗？撤销后需重新上传才能再次提交。`"
      confirmText="确认撤销"
      @close="withdrawTarget = null"
      @confirm="doWithdraw" />

    <!-- Toast -->
    <Teleport to="body">
      <div v-if="toast.show" class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg" :class="toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'" @click="toast.show = false">
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import SubmitSkillDialog from '../components/SubmitSkillDialog.vue'
import AppDialog from '../components/AppDialog.vue'
import { loadPermissions, can } from '../composables/usePermissions.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()
const loading = ref(true)
const skills = ref([])
const featureFlags = ref({ skillctlDocUrl: '' })
const canSubmit = ref(false)
const showSubmitDialog = ref(false)
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))

const statusText = (status) => ({
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤销',
  deleted: '已删除',
}[status] || status)

const statusClass = (status) => ({
  pending: 'bg-[#fff7ed] text-[#9a3412]',
  approved: 'bg-[#ecfdf5] text-[#047857]',
  rejected: 'bg-[#fef2f2] text-[#b91c1c]',
  withdrawn: 'bg-slate-100 text-slate-600',
  deleted: 'bg-slate-100 text-slate-600',
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

const loadSkills = async (resetPage = false) => {
  if (resetPage) page.value = 1
  loading.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/my/skills?page=${page.value}&limit=${limit.value}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      router.push({ path: '/login', query: { redirect: '/my-skills' } })
      return
    }
    const data = await res.json()
    skills.value = data.data || []
    total.value = data.pagination?.total || 0
  } finally {
    loading.value = false
  }
}

const goPage = (p) => {
  page.value = Math.min(Math.max(1, p), totalPages.value)
  loadSkills()
}

const onSkillSubmitted = () => {
  // 弹框内部已展示「提交成功」成功态, 这里只刷新列表(回到第 1 页)
  loadSkills(true)
}

// —— 撤销 ——
const withdrawTarget = ref(null)
const withdrawing = ref(false)
const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}
const confirmWithdraw = (skill) => { withdrawTarget.value = skill }
const doWithdraw = async () => {
  if (!withdrawTarget.value || withdrawing.value) return
  withdrawing.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/my/skills/${withdrawTarget.value.id}/withdraw`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.reason || '撤销失败')
    withdrawTarget.value = null
    showToast('已撤销，可重新上传提交', 'success')
    loadSkills()
  } catch (e) {
    showToast(e.message || '撤销失败', 'error')
  } finally {
    withdrawing.value = false
  }
}

onMounted(async () => {
  loadSkills()
  loadFeatureFlags()
  await loadPermissions()
  canSubmit.value = can('skill:create')
})
</script>
