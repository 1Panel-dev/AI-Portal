<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[1000px] mx-auto px-6 py-10 pt-[132px]">
      <!-- Admin Nav -->
      <div class="flex items-center gap-4 mb-6">
        <button
          @click="$router.push('/admin')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          审核管理
        </button>
        <button
          @click="$router.push('/admin/skills')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/skills' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          技能管理
        </button>
        <button
          @click="$router.push('/admin/users')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/users' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          用户管理
        </button>
        <button
          @click="$router.push('/admin/config')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/config' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          系统配置
        </button>
        <button
          @click="$router.push('/admin/oauth')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/oauth' ? 'bg-text text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          第三方登录
        </button>
      </div>

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
        </div>
        <button
          @click="logout"
          class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
        >
          退出登录
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b border-[rgba(0,0,0,0.06)]">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="currentTab = tab.id"
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
      <div v-else-if="filteredSubmissions.length === 0" class="text-center py-20">
        <div class="text-4xl mb-4">{{ emptyEmoji }}</div>
        <p class="text-text-secondary">{{ emptyText }}</p>
      </div>

      <!-- Submissions List -->
      <div v-else class="space-y-4">
        <div
          v-for="sub in filteredSubmissions"
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
                <span v-if="sub.reviewed_at">
                  {{ sub.status === 'approved' ? '✓ 通过' : '✕ 拒绝' }}于 {{ formatDate(sub.reviewed_at) }}
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
              @click="approve(sub.id)"
              :disabled="processing[sub.id]"
              class="flex-1 py-2 bg-text text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-all disabled:opacity-50"
            >
              {{ processing[sub.id] ? '处理中...' : '✓ 通过' }}
            </button>
            <button
              @click="showRejectDialog(sub.id)"
              :disabled="processing[sub.id]"
              class="flex-1 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
            >
              ✕ 拒绝
            </button>
          </div>
        </div>
      </div>
    </main>

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
import { ref, computed, watchEffect, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import { avatarColors } from '../data/categories.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const submissions = ref([])
const currentTab = ref('pending')
const loading = ref(true)
const processing = ref({})
const rejectingId = ref(null)
const rejectNote = ref('')
const dashboardStats = ref({})

const tabs = [
  { id: 'pending', name: '待审核' },
  { id: 'approved', name: '已通过' },
  { id: 'rejected', name: '已拒绝' },
  { id: 'all', name: '全部记录' },
]

const stats = ref({ pending: 0, approved: 0, rejected: 0 })
watchEffect(() => {
  let pending = 0, approved = 0, rejected = 0
  for (const s of submissions.value) {
    switch (s.status) {
      case 'pending': pending++; break
      case 'approved': approved++; break
      case 'rejected': rejected++; break
    }
  }
  stats.value = { pending, approved, rejected }
})

const displayPackageName = (submission) => {
  if (submission.package_name) return submission.package_name
  const filePath = submission.file_path || ''
  if (!filePath) return ''
  return filePath.split(/[\\/]/).filter(Boolean).pop() || ''
}

const filteredSubmissions = computed(() => {
  if (currentTab.value === 'all') {
    return submissions.value
  }
  return submissions.value.filter(s => s.status === currentTab.value)
})

const emptyEmoji = computed(() => {
  const map = { pending: '✅', approved: '✨', rejected: '📋', all: '📂' }
  return map[currentTab.value] || '📂'
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

const getToken = () => localStorage.getItem('admin_token')

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

const fetchSubmissions = async () => {
  loading.value = true
  try {
    const response = await fetch(`${API_BASE}/admin/submissions/all`, {
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

    submissions.value = await response.json()
  } catch (err) {
    console.error('Error:', err)
  } finally {
    loading.value = false
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
      await fetchSubmissions()
    } else {
      alert('审核失败')
    }
  } catch (err) {
    alert('网络错误')
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
      await fetchSubmissions()
    } else {
      alert('操作失败')
    }
  } catch (err) {
    alert('网络错误')
  } finally {
    processing.value[id] = false
  }
}

const logout = () => {
  localStorage.removeItem('admin_token')
  router.push('/admin/login')
}

onMounted(() => {
  const token = getToken()
  if (!token) {
    router.push('/admin/login')
    return
  }
  fetchSubmissions()
  fetchDashboardStats()
})
</script>
