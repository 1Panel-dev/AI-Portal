<template>
  <div>
      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-4 mb-8">
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
          <div class="text-2xl font-bold text-text">{{ dashboardStats.skills?.total || 0 }}</div>
          <div class="text-xs text-text-secondary">总技能数</div>
        </div>
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
          <div class="text-2xl font-bold text-green-600">{{ dashboardStats.skills?.active || 0 }}</div>
          <div class="text-xs text-text-secondary">已上架</div>
        </div>
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
          <div class="text-2xl font-bold text-amber-600">{{ dashboardStats.submissions?.pending || 0 }}</div>
          <div class="text-xs text-text-secondary">待审核</div>
        </div>
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
          <div class="text-2xl font-bold text-blue-600">{{ formatNumber(dashboardStats.skills?.total_downloads) }}</div>
          <div class="text-xs text-text-secondary">总下载量</div>
        </div>
      </div>

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">技能审核后台</h1>
          <p class="text-text-secondary text-sm mt-1">
            待审核: {{ stats.pending }} 个 | 已通过: {{ stats.approved }} 个 | 已拒绝: {{ stats.rejected }} 个
          </p>
          <p v-if="reviewError" class="text-sm text-red-500 mt-2">{{ reviewError }}</p>
        </div>

      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b border-[rgba(0,0,0,0.06)]">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="switchTab(tab.id)"
          class="px-4 py-2 text-sm font-medium transition-all"
          :class="currentTab === tab.id
            ? 'text-accent border-b-2 border-accent'
            : 'text-text-secondary hover:text-text'"
        >
          {{ tab.name }}
          <span
            v-if="tab.id === 'pending' && stats.pending > 0"
            class="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full"
          >
            {{ stats.pending }}
          </span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">
        加载中...
      </div>

      <!-- Empty -->
      <div v-else-if="submissions.length === 0" class="text-center py-20">
        <component :is="emptyIcon" class="w-12 h-12 mx-auto mb-4 text-text-tertiary" />
        <p class="text-text-secondary">{{ emptyText }}</p>
      </div>

      <!-- Submissions List -->
      <div v-else class="space-y-4">
        <div
          v-for="sub in submissions"
          :key="sub.id"
          class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-sm"
        >
          <div class="flex items-start gap-4">
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
              :class="avatarColors[sub.avatar_color] || 'bg-gray-100 text-gray-700'"
            >
              {{ sub.avatar || sub.skill_id?.[0]?.toUpperCase() || 'S' }}
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-semibold text-text">{{ sub.title }}</h3>
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="statusClass(sub.status)"
                >
                  {{ sub.status_text || statusText(sub.status) }}
                </span>
              </div>
              <p class="text-sm text-text-secondary mb-2">
                {{ sub.description }}
              </p>
              <div class="flex items-center gap-3 text-xs text-text-tertiary flex-wrap">
                <span>ID: {{ sub.skill_id }}</span>
                <span>分类: {{ sub.category }}</span>
                <span>作者: {{ sub.author }}</span>
                <span>版本: {{ sub.version }}</span>
                <span v-if="displayPackageName(sub)">包名: {{ displayPackageName(sub) }}</span>
              </div>
              <div class="mt-3 p-2 bg-surface-secondary rounded-lg">
                <code class="text-xs font-mono text-text">{{ sub.install_command }}</code>
              </div>
              <!-- Review Info -->
              <div v-if="sub.status !== 'pending'" class="mt-3 text-xs text-text-tertiary">
                <span v-if="sub.reviewed_at" class="inline-flex items-center gap-1">
                  <component :is="sub.status === 'approved' ? Check : X" class="w-3 h-3" />{{ sub.status === 'approved' ? '通过' : '拒绝' }}于 {{ formatDate(sub.reviewed_at) }}
                </span>
                <span v-if="sub.review_note" class="ml-2 text-red-500">
                  原因: {{ sub.review_note }}
                </span>
              </div>
            </div>
          </div>

          <!-- Actions (only for pending) -->
          <div v-if="sub.status === 'pending'" class="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)]">
            <button
              v-if="can('skill:review')"
              @click="approve(sub.id)"
              :disabled="processing[sub.id]"
              class="inline-flex items-center justify-center gap-1.5 flex-1 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              <Check class="w-4 h-4" />{{ processing[sub.id] ? '处理中...' : '通过' }}
            </button>
            <button
              v-if="can('skill:review')"
              @click="showRejectDialog(sub.id)"
              :disabled="processing[sub.id]"
              class="inline-flex items-center justify-center gap-1.5 flex-1 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
            >
              <X class="w-4 h-4" />拒绝
            </button>
          </div>
        </div>
      </div>

      <Pagination class="mt-6" :page="page" :total-pages="totalPages" :total="total" @change="goPage" />
    <!-- Reject Dialog -->
    <div
      v-if="rejectingId"
      class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      @click="rejectingId = null"
    >
      <div class="bg-white rounded-xl p-6 max-w-md w-full" @click.stop>
        <h3 class="font-semibold text-text mb-4">拒绝原因（可选）</h3>
        <textarea
          v-model="rejectNote"
          rows="3"
          class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-text bg-surface-secondary outline-none resize-none mb-4"
          placeholder="填写拒绝原因..."
        ></textarea>
        <div class="flex gap-3">
          <button
            @click="rejectingId = null"
            class="flex-1 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm"
          >
            取消
          </button>
          <button
            @click="reject(rejectingId)"
            class="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm"
          >
            确认拒绝
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, CheckCircle2, ClipboardList, Inbox, Check, X } from 'lucide-vue-next'
import { avatarColors } from '../data/categories.js'

import { getLoginToken } from '../lib/apiBase'
import Pagination from '../components/Pagination.vue'
import { can, loadPermissions } from '../composables/usePermissions.js'
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const submissions = ref([])
const currentTab = ref('pending')
const loading = ref(true)
const processing = ref({})
const rejectingId = ref(null)
const rejectNote = ref('')
const dashboardStats = ref({})
const reviewError = ref('')
function showReviewError(msg) {
  reviewError.value = msg
  if (msg) setTimeout(() => { reviewError.value = '' }, 4000)
}

const tabs = [
  { id: 'pending', name: '待审核' },
  { id: 'approved', name: '已通过' },
  { id: 'rejected', name: '已拒绝' },
  { id: 'all', name: '全部记录' },
]

const stats = ref({ pending: 0, approved: 0, rejected: 0 })
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))

const displayPackageName = (submission) => {
  if (submission.package_name) return submission.package_name
  const filePath = submission.file_path || ''
  if (!filePath) return ''
  return filePath.split(/[\\/]/).filter(Boolean).pop() || ''
}

const emptyIcon = computed(() => {
  const map = { pending: Clock, approved: CheckCircle2, rejected: ClipboardList, all: Inbox }
  return map[currentTab.value] || Inbox
})

const emptyText = computed(() => {
  const map = {
    pending: '没有待审核的技能',
    approved: '没有已通过的技能',
    rejected: '没有已拒绝的技能',
    all: '暂无审核记录'
  }
  return map[currentTab.value] || '暂无记录'
})

const getToken = () => getLoginToken()

const statusClass = (status) => {
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    deleted: 'bg-slate-100 text-slate-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

const statusText = (status) => {
  const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝', deleted: '已删除' }
  return map[status] || status
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatNumber = (num) => {
  if (!num) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toString()
}

const fetchDashboardStats = async () => {
  try {
    const response = await fetch(`${API_BASE}/admin/stats`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })

    if (response.ok) {
      dashboardStats.value = await response.json()
    }
  } catch (err) {
    console.error('Error fetching stats:', err)
  }
}

const fetchSubmissions = async (resetPage = true) => {
  if (resetPage) page.value = 1
  loading.value = true
  try {
    const params = new URLSearchParams({
      status: currentTab.value,
      page: String(page.value),
      limit: String(limit.value),
    })
    const response = await fetch(`${API_BASE}/admin/submissions/all?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('admin_token')
        router.push('/admin/login')
        return
      }
      throw new Error('获取列表失败')
    }

    const result = await response.json()
    submissions.value = result.data || []
    stats.value = result.counts || { pending: 0, approved: 0, rejected: 0 }
    total.value = result.pagination?.total || 0
  } catch (err) {
    console.error('Error:', err)
  } finally {
    loading.value = false
  }
}

function switchTab(id) {
  currentTab.value = id
  fetchSubmissions(true)
}

function goPage(p) {
  page.value = Math.min(Math.max(1, p), totalPages.value)
  fetchSubmissions(false)
}

// 审核后刷新当前页; 当前页因操作变空时回退一页
async function refetchCurrent() {
  await fetchSubmissions(false)
  if (submissions.value.length === 0 && page.value > 1) {
    page.value--
    await fetchSubmissions(false)
  }
}

const approve = async (id) => {
  processing.value[id] = true
  try {
    const response = await fetch(`${API_BASE}/admin/approve/${id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })

    if (response.ok) {
      await refetchCurrent()
    } else {
      showReviewError('审核失败')
    }
  } catch (err) {
    showReviewError('网络错误')
  } finally {
    processing.value[id] = false
  }
}

const showRejectDialog = (id) => {
  rejectingId.value = id
  rejectNote.value = ''
}

const reject = async (id) => {
  processing.value[id] = true
  try {
    const response = await fetch(`${API_BASE}/admin/reject/${id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ note: rejectNote.value }),
    })

    if (response.ok) {
      rejectingId.value = null
      await refetchCurrent()
    } else {
      showReviewError('操作失败')
    }
  } catch (err) {
    showReviewError('网络错误')
  } finally {
    processing.value[id] = false
  }
}

onMounted(() => {
  const token = getToken()
  if (!token) {
    router.push('/admin/login')
    return
  }
  loadPermissions()
  fetchSubmissions()
  fetchDashboardStats()
})
</script>
