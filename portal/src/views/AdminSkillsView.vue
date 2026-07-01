<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[1000px] mx-auto px-6 py-10 pt-[132px]">
      <!-- Admin Nav -->
      <div class="flex items-center gap-4 mb-6">
        <button
          @click="$router.push('/admin')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          审核管理
        </button>
        <button
          @click="$router.push('/admin/skills')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/skills' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          技能管理
        </button>
        <button
          @click="$router.push('/admin/users')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/users' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          用户管理
        </button>
        <button
          @click="$router.push('/admin/config')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/config' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          系统配置
        </button>
        <button
          @click="$router.push('/admin/oauth')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/oauth' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
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
          <p v-if="skillError" class="text-sm text-red-500 mt-2">{{ skillError }}</p>
        </div>
        <div class="flex gap-3">
          <button
            @click="$router.push('/admin')"
            class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
          >
            <ArrowLeft class="w-4 h-4" />返回审核
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
              ? 'bg-accent text-white'
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
          <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
        </div>
        <div class="flex-1 relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
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
          <ArrowUpDown class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">
        加载中...
      </div>

      <!-- Empty -->
      <div v-else-if="skills.length === 0" class="text-center py-20">
        <Inbox class="w-12 h-12 mx-auto mb-4 text-text-tertiary" />
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
                <Pencil class="w-4 h-4" />
              </button>
              <button
                @click="toggleSkill(skill)"
                :disabled="processing[skill.id]"
                class="p-2 text-text-secondary hover:text-accent transition-all"
                :title="skill.is_active ? '下架' : '上架'"
              >
                <component :is="skill.is_active ? Eye : EyeOff" class="w-4 h-4" />
              </button>
              <button
                @click="confirmDelete(skill)"
                class="p-2 text-text-secondary hover:text-red-500 transition-all"
                title="删除"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Load More -->
        <div v-if="pagination.hasMore" class="flex justify-center pt-4">
          <button
            @click="loadMore"
            :disabled="loadingMore"
            class="px-6 py-2 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg text-sm font-medium hover:bg-accent-hover hover:text-white hover:border-text transition-all disabled:opacity-50"
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
            <X class="w-5 h-5" />
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
            class="flex-1 py-2 bg-accent text-white rounded-lg text-sm"
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
import { ChevronDown, Search, ArrowUpDown, Inbox, Pencil, Eye, EyeOff, Trash2, X, ArrowLeft } from 'lucide-vue-next'
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
const skillError = ref('')
function showSkillError(msg) {
  skillError.value = msg
  if (msg) setTimeout(() => { skillError.value = '' }, 4000)
}

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
  { id: 'downloads', name: '下载量(高到低)' },
  { id: 'downloadsAsc', name: '下载量(低到高)' },
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
      showSkillError('保存失败')
    }
  } catch (err) {
    showSkillError('网络错误')
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
      showSkillError('操作失败')
    }
  } catch (err) {
    showSkillError('网络错误')
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
      showSkillError('删除失败')
    }
  } catch (err) {
    showSkillError('网络错误')
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
