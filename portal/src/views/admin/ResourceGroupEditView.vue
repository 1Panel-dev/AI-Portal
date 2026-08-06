<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">编辑资源组{{ group?.name ? ' · ' + group.name : '' }}</h1>
        <p class="text-text-secondary text-sm mt-1">配置资源组包含的资源；用户授权请在「资源授权」页管理</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="$router.push('/admin/groups')" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all">返回</button>
      </div>
    </div>

    <!-- ===== 包含资源 ===== -->
    <div v-if="activeTab === 'resources'">
      <div v-if="!resourceTypes.length" class="py-14 text-center text-sm text-text-secondary">资源类型加载中...</div>
      <template v-else>
        <!-- 子 tab: 每个资源类型一个 -->
        <div class="flex gap-2 mb-5">
          <div
            v-for="rt in resourceTypes"
            :key="rt.key"
            class="px-4 py-2 text-[13px] cursor-pointer rounded-lg border transition-all"
            :class="activeResourceType === rt.key ? 'bg-white text-accent border-[rgba(0,94,235,0.3)] font-semibold shadow-card' : 'bg-surface-secondary text-text-secondary border-transparent hover:text-text'"
            @click="switchResourceType(rt.key)"
          >
            {{ rt.name }} <span class="text-text-tertiary font-normal">({{ selectedCount(rt.key) }}/{{ totalCount(rt.key) }})</span>
          </div>
        </div>

        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3">
          <input
            v-model="resourceKeyword"
            class="flex-1 px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
            placeholder="搜索名称..."
            @keyup.enter="filterResources"
          />
          <button @click="filterResources" class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover">搜索</button>
        </div>

        <div v-if="resourceLoading" class="py-14 text-center text-sm text-text-secondary">加载中...</div>
        <div v-else-if="!filteredResources.length" class="py-14 text-center text-sm text-text-secondary">暂无{{ activeTypeName }}资源</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto">
          <label
            v-for="r in filteredResources"
            :key="r.id"
            class="flex items-center gap-2.5 px-3 py-2.5 border rounded-lg cursor-pointer transition-all"
            :class="isResourceSelected(r.id) ? 'bg-[rgba(0,94,235,0.05)] border-[rgba(0,94,235,0.3)]' : 'border-[rgba(0,0,0,0.06)] hover:bg-surface-secondary'"
          >
            <input type="checkbox" :checked="isResourceSelected(r.id)" class="h-4 w-4 accent-accent" @change="toggleResource(r.id)" />
            <div class="flex-1 min-w-0">
              <div class="text-[13px] text-text truncate">{{ r.title }}</div>
              <div v-if="r.subtitle" class="text-[11px] text-text-tertiary truncate">{{ r.subtitle }}</div>
            </div>
          </label>
        </div>

        <p class="text-xs text-text-tertiary mt-3">已选 {{ selectedCount(activeResourceType) }} / 共 {{ totalCount(activeResourceType) }} 个{{ activeTypeName }}。</p>
        <div class="mt-4">
          <button @click="saveItems" :disabled="savingItems" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">{{ savingItems ? '保存中...' : '保存包含资源' }}</button>
        </div>
      </template>
    </div>

    <!-- ===== 模型可见性预览（已移除：统一到「资源授权」页的资源预览 tab） ===== -->

    <!-- Toast -->
    <Teleport to="body">
      <div v-if="toast.show" class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-fade-up" :class="toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'" @click="toast.show = false">
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { API_BASE } from '../../lib/apiBase'

const route = useRoute()
const router = useRouter()
const getToken = () => localStorage.getItem('admin_token') || localStorage.getItem('token')
const groupId = route.params.id

const tabs = [
  { key: 'resources', label: '包含资源' },
]
const activeTab = ref('resources')

const group = ref(null)

// ---- 资源类型 + 包含资源 ----
const resourceTypes = ref([])          // [{key:'model',name:'模型'},...]
const activeResourceType = ref('')     // 当前子 tab
const resourceCatalog = reactive({})   // { model: [{id, title, subtitle}], skill: [...], mcp: [...] }
const resourceKeyword = ref('')
const resourceLoading = ref(false)
// 选中态: { model: Set<resource_id>, skill: Set, mcp: Set }
const selectedResources = reactive({})
const savingItems = ref(false)

const activeTypeName = computed(() => resourceTypes.value.find(t => t.key === activeResourceType.value)?.name || '')
const filteredResources = computed(() => {
  const list = resourceCatalog[activeResourceType.value] || []
  const kw = resourceKeyword.value.trim().toLowerCase()
  if (!kw) return list
  return list.filter(r => (r.title || '').toLowerCase().includes(kw) || (r.subtitle || '').toLowerCase().includes(kw))
})

function selectedCount(key) { return (selectedResources[key]?.size) || 0 }
function totalCount(key) { return (resourceCatalog[key]?.length) || 0 }
function isResourceSelected(id) { return selectedResources[activeResourceType.value]?.has(String(id)) || false }

function switchResourceType(key) {
  activeResourceType.value = key
  resourceKeyword.value = ''
}
function filterResources() { /* 计算属性自动响应, 此处仅占位供按钮点击 */ }

function toggleResource(id) {
  const key = activeResourceType.value
  if (!selectedResources[key]) selectedResources[key] = new Set()
  const s = selectedResources[key]
  const idStr = String(id)
  s.has(idStr) ? s.delete(idStr) : s.add(idStr)
  // 触发响应式: 重新赋值
  selectedResources[key] = new Set(s)
}

// ---- Toast ----
const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

// ---- 拉取详情 + 资源类型 ----
async function fetchGroupDetail() {
  try {
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    if (res.status === 404) { showToast('资源组不存在', 'error'); router.push('/admin/groups'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取详情失败')
    group.value = data.data
    // 回填已选资源
    const items = data.data?.items || []
    for (const it of items) {
      if (!selectedResources[it.resource_type]) selectedResources[it.resource_type] = new Set()
      selectedResources[it.resource_type].add(String(it.resource_id))
    }
  } catch (err) {
    showToast(err.message || '获取详情失败', 'error')
  }
}

async function fetchResourceTypes() {
  try {
    const res = await fetch(`${API_BASE}/admin/resource-types`, { headers: { Authorization: `Bearer ${getToken()}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取资源类型失败')
    resourceTypes.value = data.data || []
    // 初始化选中容器
    for (const rt of resourceTypes.value) {
      if (!selectedResources[rt.key]) selectedResources[rt.key] = new Set()
    }
    if (resourceTypes.value.length && !activeResourceType.value) {
      activeResourceType.value = resourceTypes.value[0].key
    }
  } catch (err) {
    showToast(err.message || '获取资源类型失败', 'error')
  }
}

// 拉取某资源类型的全量列表（复用现有接口）
async function fetchResourceList(key) {
  resourceLoading.value = true
  try {
    if (key === 'model') {
      // /api/models -> { groups: [{name, provider, models:[{model_name, group_name, provider}]}] }
      const res = await fetch(`${API_BASE}/models`, { headers: { Authorization: `Bearer ${getToken()}` } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '获取模型失败')
      const list = []
      for (const g of (data.groups || [])) {
        for (const m of (g.models || [])) {
          list.push({ id: m.model_name, title: m.model_name, subtitle: `${g.name} · ${m.provider || ''}` })
        }
      }
      resourceCatalog[key] = list
    } else if (key === 'skill') {
      // /api/skills -> { data: [{slug, title, ...}], pagination:{total} } ; 翻全量
      const list = []
      let page = 1
      const limit = 100
      while (true) {
        const res = await fetch(`${API_BASE}/skills?page=${page}&limit=${limit}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '获取技能失败')
        const rows = data.data || []
        for (const s of rows) list.push({ id: s.slug, title: s.title, subtitle: s.slug })
        const hasMore = data.pagination?.hasMore
        if (!hasMore || rows.length < limit) break
        page++
        if (page > 50) break // 翻页保护
      }
      resourceCatalog[key] = list
    } else if (key === 'mcp') {
      // /api/mcp/search -> { data: [{id, name, ...}], pagination } ; 翻全量
      const list = []
      let page = 1
      const pageSize = 100
      while (true) {
        const res = await fetch(`${API_BASE}/mcp/search?page=${page}&pageSize=${pageSize}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || data.reason || '获取 MCP 失败')
        const items = data.data || []
        for (const it of items) list.push({ id: String(it.id ?? it.key ?? it.name), title: it.name || it.key || '未命名', subtitle: it.type || '' })
        const hasMore = data.pagination?.hasMore
        if (!hasMore || items.length < pageSize) break
        page++
        if (page > 50) break
      }
      resourceCatalog[key] = list
    }
  } catch (err) {
    const typeName = resourceTypes.value.find(t => t.key === key)?.name || key
    showToast(err.message || `获取${typeName}列表失败`, 'error')
    resourceCatalog[key] = []
  } finally {
    resourceLoading.value = false
  }
}

async function saveItems() {
  savingItems.value = true
  try {
    const items = []
    for (const key of Object.keys(selectedResources)) {
      for (const rid of selectedResources[key]) {
        items.push({ resource_type: key, resource_id: rid })
      }
    }
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}/items`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.reason || '保存失败')
    showToast('包含资源已保存', 'success')
  } catch (err) {
    showToast(err.message || '保存失败', 'error')
  } finally {
    savingItems.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchGroupDetail(), fetchResourceTypes()])
  // 拉取各资源类型全量列表
  for (const rt of resourceTypes.value) {
    await fetchResourceList(rt.key)
  }
})
onUnmounted(() => { if (toastTimer) clearTimeout(toastTimer) })
</script>
