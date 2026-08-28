<style scoped>
/* 与 AdminModelsView 的 .model-input 保持一致，编辑弹框输入框统一观感 */
.skill-input {
  @apply w-full h-10 px-3 text-sm text-text bg-white border border-black/10 rounded-lg outline-none transition-all placeholder:text-text-tertiary;
}
.skill-input:focus {
  @apply border-text/30 ring-2 ring-accent/10;
}
textarea.skill-input { @apply h-auto py-2.5; }
</style>

<template>
  <div>
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
            v-if="can('system:config')"
            @click="syncSkills" :disabled="syncing"
            class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary transition-all disabled:opacity-50"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': syncing }" />{{ syncing ? '同步中...' : '同步' }}
          </button>
          <button
            @click="$router.push('/admin')"
            class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary transition-all"
          >
            <ArrowLeft class="w-4 h-4" />返回审核
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
                v-if="can('skill:edit')"
                @click="editSkill(skill)"
                class="p-2 text-text-secondary hover:text-accent transition-all"
                title="编辑"
              >
                <Pencil class="w-4 h-4" />
              </button>
              <button
                v-if="can('skill:publish')"
                @click="toggleSkill(skill)"
                :disabled="processing[skill.id]"
                class="p-2 text-text-secondary hover:text-accent transition-all"
                :title="skill.is_active ? '下架' : '上架'"
              >
                <component :is="skill.is_active ? Eye : EyeOff" class="w-4 h-4" />
              </button>
              <button
                v-if="can('skill:delete')"
                @click="confirmDelete(skill)"
                class="p-2 text-text-secondary hover:text-red-500 transition-all"
                title="删除"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <Pagination class="mt-6" :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total" label="个技能" show-first-last :page-size="pagination.limit" @change="goPage" @page-size-change="onPageSizeChange" />
      </div>
    <!-- Edit Dialog -->
    <AppDialog :open="!!editingSkill" :title="`编辑技能 - ${editingSkill?.title || ''}`" size="lg" static @close="editingSkill = null">
      <div v-if="editingSkill" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-text mb-1">标题</label>
          <input v-model="editForm.title" class="skill-input" placeholder="技能标题" />
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">描述</label>
          <textarea v-model="editForm.description" rows="3" class="skill-input resize-none" placeholder="技能简介"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">分类</label>
          <select v-model="editForm.category" class="skill-input">
            <option v-for="cat in categoryOptions" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">安装命令</label>
          <input v-model="editForm.installCommand" class="skill-input font-mono" placeholder="如 f2c install xxx" />
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">文档链接</label>
          <input v-model="editForm.installUrl" class="skill-input" placeholder="https://..." />
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">版本</label>
          <input v-model="editForm.version" class="skill-input" placeholder="1.0.0" />
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-2">标签</label>
          <div ref="tagFieldRef" class="relative">
            <button type="button" @click="tagDropdownOpen = !tagDropdownOpen" class="skill-input text-left flex items-center justify-between">
              <span class="text-sm" :class="editTagIds.length ? 'text-text' : 'text-text-tertiary'">{{ editTagIds.length ? `已选 ${editTagIds.length} 个标签` : '选择标签' }}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-tertiary transition-transform" :class="{ 'rotate-180': tagDropdownOpen }"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div v-if="tagDropdownOpen" class="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              <button v-for="t in skillTags" :key="t.id" type="button" @click="toggleEditTag(t.id)" class="flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary cursor-pointer text-sm w-full text-left">
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>
                <span class="text-xs">{{ t.name }}</span>
                <svg v-if="editTagIds.includes(t.id)" class="ml-auto text-accent shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
              </button>
              <div v-if="!skillTags.length" class="px-3 py-2 text-xs text-text-tertiary">暂无可用标签</div>
            </div>
          </div>
          <div v-if="editTagIds.length" class="flex flex-wrap gap-1.5 mt-2">
            <span v-for="tagId in editTagIds" :key="tagId" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" :style="{ backgroundColor: `${getTagColor(tagId)}15`, color: getTagColor(tagId) }">
              {{ getTagName(tagId) }}
              <button type="button" @click="toggleEditTag(tagId)" class="opacity-60 hover:opacity-100">&times;</button>
            </span>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm btn-secondary" @click="editingSkill = null">取消</button>
        <button class="px-4 py-2 text-sm btn-primary disabled:opacity-50" :disabled="saving" @click="saveEdit">{{ saving ? '保存中...' : '保存' }}</button>
      </template>
    </AppDialog>

    <!-- Delete Confirm Dialog -->
    <AppDialog :open="!!deletingSkill" title="确认删除" :message="`确定要删除技能「${deletingSkill?.title || ''}」吗？此操作不可恢复。`" type="confirm" confirmText="删除" @close="deletingSkill = null" @confirm="deleteSkill" />
  </div>
</template>

<script setup>
import { ref, watchEffect, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, Search, ArrowUpDown, Inbox, Pencil, Eye, EyeOff, Trash2, ArrowLeft, RefreshCw } from 'lucide-vue-next'
import { avatarColors, categories } from '../data/categories.js'

import { getLoginToken, errMsg } from '../lib/apiBase'
import AppDialog from '../components/AppDialog.vue'
import Pagination from '../components/Pagination.vue'
import { can, loadPermissions } from '../composables/usePermissions.js'
import { showToast } from '../composables/useToast.js'
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const skills = ref([])
const currentTab = ref('all')
const currentCategory = ref('all')
const searchQuery = ref('')
const sortBy = ref('downloads')
const loading = ref(true)
const processing = ref({})
const editingSkill = ref(null)
const editForm = ref({})
const editTagIds = ref([])
const tagDropdownOpen = ref(false)
const tagFieldRef = ref(null)
const allTags = ref([])
const skillTags = computed(() => allTags.value.filter(t => Array.isArray(t.resource_types) && t.resource_types.includes('skill')))
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
})

// 搜索防抖
let searchTimeout = null
// 请求版本号: 丢弃过期响应
let fetchSeq = 0

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

const getToken = () => getLoginToken()

const syncing = ref(false)

const syncSkills = async () => {
  if (syncing.value) return
  syncing.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/panel-config/sync-now`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (res.status === 401) {
      localStorage.removeItem('admin_token')
      return router.push('/admin/login')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '同步失败'))
    showToast('同步完成', 'success')
    await fetchSkills(true)
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

const fetchSkills = async (reset = false) => {
  if (reset) {
    pagination.value.page = 1
    skills.value = []
  }

  if (loading.value && !reset) return

  // 过期响应丢弃: 快速切tab/搜索/翻页时, 后到的新请求生效, 旧响应不覆盖
  const mySeq = ++fetchSeq
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

    if (mySeq !== fetchSeq) return

    skills.value = result.data
    stats.value = result.stats || { active: 0, inactive: 0 }
    pagination.value = result.pagination
  } catch (err) {
    console.error('Error:', err)
  } finally {
    if (mySeq === fetchSeq) {
      loading.value = false
    }
  }
}

// 标签相关
const fetchTags = async () => {
  try { allTags.value = (await (await fetch(`${API_BASE}/admin/tags`, { headers: { Authorization: `Bearer ${getToken()}` } })).json()).data || [] } catch (_) {}
}
const getTagName = (id) => (allTags.value.find(t => t.id === id) || {}).name || ''
const getTagColor = (id) => (allTags.value.find(t => t.id === id) || {}).color || '#64748b'
const toggleEditTag = (id) => {
  const idx = editTagIds.value.indexOf(id)
  if (idx >= 0) editTagIds.value.splice(idx, 1)
  else editTagIds.value.push(id)
}

const goPage = (p) => {
  if (p < 1 || p > pagination.value.totalPages) return
  pagination.value.page = p
  fetchSkills()
}

const onPageSizeChange = (size) => {
  pagination.value.limit = size
  pagination.value.page = 1
  fetchSkills()
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

const editSkill = async (skill) => {
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
  // 加载技能标签
  try {
    const res = await fetch(`${API_BASE}/admin/skill-tags?skill_ids=${skill.id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
    const data = await res.json()
    editTagIds.value = (data.data[skill.id] || []).map(t => t.id)
  } catch (_) { editTagIds.value = [] }
  tagDropdownOpen.value = false
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
      // 保存标签
      try {
        await fetch(`${API_BASE}/admin/skill-tags/${editingSkill.value.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tag_ids: editTagIds.value }),
        })
      } catch (tagErr) {
        console.error('标签保存失败:', tagErr)
      }
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

onMounted(() => {
  const token = getToken()
  if (!token) {
    router.push('/admin/login')
    return
  }
  loadPermissions()
  fetchSkills(true)
  fetchTags()
})
</script>
