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

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">技能管理</h1>
          <p class="text-text-secondary text-sm mt-1">
            已上架: {{ stats.active }} 个 | 已下架: {{ stats.inactive }} 个 | 共 {{ pagination.total }} 个
          </p>
        </div>
        <div class="flex gap-3">
          <button
            @click="$router.push('/admin')"
            class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
          >
            ← 返回审核
          </button>
          <button
            @click="logout"
            class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
          >
            退出登录
          </button>
        </div>
      </div>

      <!-- Filter & Search & Sort -->
      <div class="flex gap-3 mb-6">
        <div class="flex gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="onTabChange(tab.id)"
            class="px-4 py-2 text-sm font-medium transition-all rounded-lg"
            :class="currentTab === tab.id
              ? 'bg-text text-white'
              : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
          >
            {{ tab.name }}
          </button>
        </div>
        <!-- Category Filter -->
        <div class="relative">
          <select
            v-model="currentCategory"
            @change="onCategoryChange"
            class="appearance-none px-4 py-2 pr-8 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg text-sm font-medium outline-none focus:border-accent/50 transition-all cursor-pointer"
          >
            <option value="all">全部分类</option>
            <option v-for="cat in categoryOptions" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
          <svg class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div class="flex-1 relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索技能名称、ID或作者..."
            class="w-full pl-10 pr-4 py-2 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg text-sm outline-none focus:border-accent/50 transition-all"
            @input="onSearchInput"
          >
        </div>
        <!-- Sort Dropdown -->
        <div class="relative">
          <select
            v-model="sortBy"
            class="appearance-none px-4 py-2 pr-10 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg text-sm font-medium outline-none focus:border-accent/50 transition-all cursor-pointer"
          >
            <option v-for="sort in sortOptions" :key="sort.id" :value="sort.id">
              {{ sort.name }}
            </option>
          </select>
          <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">
        加载中...
      </div>

      <!-- Empty -->
      <div v-else-if="skills.length === 0" class="text-center py-20">
        <div class="text-4xl mb-4">📂</div>
        <p class="text-text-secondary">暂无技能</p>
      </div>

      <!-- Skills List -->
      <div v-else class="space-y-3">
        <div
          v-for="skill in sortedSkills"
          :key="skill.id"
          class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4"
          :class="!skill.is_active && 'opacity-60'"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold"
              :class="avatarColors[skill.avatarColor] || 'bg-gray-100 text-gray-700'"
            >
              {{ skill.avatar }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-medium text-text truncate">{{ skill.title }}</h3>
                <span
                  v-if="!skill.is_active"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600"
                >
                  已下架
                </span>
              </div>
              <p class="text-xs text-text-secondary mb-1 line-clamp-1">
                {{ skill.description }}
              </p>
              <div class="flex items-center gap-2 text-[10px] text-text-tertiary">
                <span>{{ skill.category }}</span>
                <span>·</span>
                <span>{{ skill.author }}</span>
                <span>·</span>
                <span>{{ skill.version }}</span>
                <span>·</span>
                <span>下载: {{ skill.downloads }}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button
                @click="editSkill(skill)"
                class="p-2 text-text-secondary hover:text-accent transition-all"
                title="编辑"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button
                @click="toggleSkill(skill)"
                :disabled="processing[skill.id]"
                class="p-2 text-text-secondary hover:text-accent transition-all"
                :title="skill.is_active ? '下架' : '上架'"
              >
                <svg v-if="skill.is_active" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
              </button>
              <button
                @click="confirmDelete(skill)"
                class="p-2 text-text-secondary hover:text-red-500 transition-all"
                title="删除"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Load More -->
        <div v-if="pagination.hasMore" class="flex justify-center pt-4">
          <button
            @click="loadMore"
            :disabled="loadingMore"
            class="px-6 py-2 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg text-sm font-medium hover:bg-text hover:text-white hover:border-text transition-all disabled:opacity-50"
          >
            {{ loadingMore ? '加载中...' : `加载更多 (${skills.length}/${pagination.total})` }}
          </button>
        </div>
        <div v-else-if="skills.length > 0" class="text-center py-4 text-sm text-text-tertiary">
          已加载全部 {{ pagination.total }} 个技能
        </div>
      </div>
    </main>

    <!-- Edit Dialog -->
    <div
      v-if="editingSkill"
      class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-text">编辑技能</h3>
          <button
            @click="editingSkill = null"
            class="p-1 text-text-tertiary hover:text-text transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs text-text-secondary mb-1">标题</label>
            <input
              v-model="editForm.title"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm"
            >
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">描述</label>
            <textarea
              v-model="editForm.description"
              rows="3"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm resize-none"
            ></textarea>
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">分类</label>
            <select
              v-model="editForm.category"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm bg-white"
            >
              <option v-for="cat in categoryOptions" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">安装命令</label>
            <input
              v-model="editForm.installCommand"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm font-mono"
            >
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">文档链接</label>
            <input
              v-model="editForm.installUrl"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm"
            >
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">版本</label>
            <input
              v-model="editForm.version"
              class="w-full px-3 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm"
            >
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            @click="editingSkill = null"
            class="flex-1 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm"
          >
            取消
          </button>
          <button
            @click="saveEdit"
            :disabled="saving"
            class="flex-1 py-2 bg-text text-white rounded-lg text-sm"
          >
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Dialog -->
    <div
      v-if="deletingSkill"
      class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      @click="deletingSkill = null"
    >
      <div class="bg-white rounded-xl p-6 max-w-sm w-full" @click.stop>
        <h3 class="font-semibold text-text mb-2">确认删除</h3>
        <p class="text-sm text-text-secondary mb-4">
          确定要删除技能「{{ deletingSkill.title }}」吗？此操作不可恢复。
        </p>
        <div class="flex gap-3">
          <button
            @click="deletingSkill = null"
            class="flex-1 py-2 border border-[rgba(0,0,0,0.06)] rounded-lg text-sm"
          >
            取消
          </button>
          <button
            @click="deleteSkill"
            :disabled="deleting"
            class="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm"
          >
            {{ deleting ? '删除中...' : '删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watchEffect, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import { avatarColors, categories } from '../data/categories.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const skills = ref([])
const currentTab = ref('all')
const currentCategory = ref('all')
const searchQuery = ref('')
const sortBy = ref('downloads')
const loading = ref(true)
const loadingMore = ref(false)
const processing = ref({})
const editingSkill = ref(null)
const editForm = ref({})
const saving = ref(false)
const deletingSkill = ref(null)
const deleting = ref(false)

// 可用分类列表（排除"全部"）
const categoryOptions = categories.filter(c => c.id !== 'all')

// 分页状态
const pagination = ref({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasMore: false
})

// 搜索防抖
let searchTimeout = null

const tabs = [
  { id: 'all', name: '全部' },
  { id: 'active', name: '已上架' },
  { id: 'inactive', name: '已下架' },
]

// 排序选项
const sortOptions = [
  { id: 'downloads', name: '下载量 ↓' },
  { id: 'downloadsAsc', name: '下载量 ↑' },
  { id: 'newest', name: '最新创建' },
  { id: 'oldest', name: '最早创建' },
  { id: 'title', name: '名称 A-Z' },
  { id: 'titleDesc', name: '名称 Z-A' },
]

const stats = ref({ active: 0, inactive: 0 })
watchEffect(() => {
  let active = 0, inactive = 0
  for (const s of skills.value) s.is_active ? active++ : inactive++
  stats.value = { active, inactive }
})

// 缓存的排序结果，仅当 skills 或 sortBy 变化时才重新排序
const sortedSkills = ref([])
watchEffect(() => {
  const arr = skills.value
  if (arr.length === 0) { sortedSkills.value = []; return }
  const clone = [...arr]
  clone.sort((a, b) => {
    switch (sortBy.value) {
      case 'downloads':
        return (parseInt(b.downloads) || 0) - (parseInt(a.downloads) || 0)
      case 'downloadsAsc':
        return (parseInt(a.downloads) || 0) - (parseInt(b.downloads) || 0)
      case 'newest':
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      case 'oldest':
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      case 'title':
        return (a.title || '').localeCompare(b.title || '', 'zh-CN')
      case 'titleDesc':
        return (b.title || '').localeCompare(a.title || '', 'zh-CN')
      default:
        return 0
    }
  })
  sortedSkills.value = clone
})

const getToken = () => localStorage.getItem('admin_token')

const fetchSkills = async (reset = false) => {
  if (reset) {
    pagination.value.page = 1
    skills.value = []
  }

  if (loading.value && !reset) return

  loading.value = true
  try {
    const params = new URLSearchParams()
    params.append('page', pagination.value.page.toString())
    params.append('limit', pagination.value.limit.toString())
    params.append('status', currentTab.value)

    if (currentCategory.value !== 'all') {
      params.append('category', currentCategory.value)
    }

    if (searchQuery.value.trim()) {
      params.append('search', searchQuery.value.trim())
    }

    const response = await fetch(`${API_BASE}/admin/skills?${params.toString()}`, {
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
      throw new Error('获取失败')
    }

    const result = await response.json()

    if (reset || pagination.value.page === 1) {
      skills.value = result.data
    } else {
      skills.value = [...skills.value, ...result.data]
    }

    pagination.value = result.pagination
  } catch (err) {
    console.error('Error:', err)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadMore = async () => {
  if (!pagination.value.hasMore || loadingMore.value) return
  loadingMore.value = true
  pagination.value.page++
  await fetchSkills(false)
}

const onTabChange = (tabId) => {
  currentTab.value = tabId
  fetchSkills(true)
}

const onCategoryChange = () => {
  fetchSkills(true)
}

const onSearchInput = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchSkills(true)
  }, 300)
}

const editSkill = (skill) => {
  editingSkill.value = skill
  editForm.value = {
    title: skill.title,
    description: skill.description,
    category: skill.category,
    installCommand: skill.installCommand,
    installUrl: skill.installUrl,
    version: skill.version,
    // 携带其他已知信息（只读字段）
    avatar: skill.avatar,
    avatarColor: skill.avatarColor,
    author: skill.author,
    slug: skill.slug,
  }
}

const saveEdit = async () => {
  saving.value = true
  try {
    // 合并原始数据和编辑的字段
    const updateData = {
      ...editingSkill.value,  // 原始完整数据
      ...editForm.value,       // 覆盖编辑的字段
    }

    const response = await fetch(`${API_BASE}/admin/skills/${editingSkill.value.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    })

    if (response.ok) {
      editingSkill.value = null
      await fetchSkills(true)
    } else {
      alert('保存失败')
    }
  } catch (err) {
    alert('网络错误')
  } finally {
    saving.value = false
  }
}

const toggleSkill = async (skill) => {
  processing.value[skill.id] = true
  try {
    const response = await fetch(`${API_BASE}/admin/skills/${skill.id}/toggle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })

    if (response.ok) {
      await fetchSkills(true)
    } else {
      alert('操作失败')
    }
  } catch (err) {
    alert('网络错误')
  } finally {
    processing.value[skill.id] = false
  }
}

const confirmDelete = (skill) => {
  deletingSkill.value = skill
}

const deleteSkill = async () => {
  if (!deletingSkill.value) return

  deleting.value = true
  try {
    const response = await fetch(`${API_BASE}/admin/skills/${deletingSkill.value.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })

    if (response.ok) {
      deletingSkill.value = null
      await fetchSkills(true)
    } else {
      alert('删除失败')
    }
  } catch (err) {
    alert('网络错误')
  } finally {
    deleting.value = false
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
  fetchSkills(true)
})
</script>
