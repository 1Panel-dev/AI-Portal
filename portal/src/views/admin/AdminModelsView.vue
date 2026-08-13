<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">模型管理</h1>
        <p class="text-text-secondary text-sm mt-1">模型来自 1Panel 同步，共 {{ totalModels }} 个</p>
      </div>
      <div class="flex gap-3">
        <button v-if="can('system:config')" @click="syncAll" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': syncing }" />{{ syncing ? '同步中...' : '同步' }}
        </button>
      </div>
    </div>

    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索模型名称、账户或供应商..."
          class="w-full pl-10 pr-4 py-2 bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text transition-all"
        >
      </div>
    </div>

    <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.6fr] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>模型名称</div><div>账户</div><div>供应商</div><div>类型</div><div>状态</div>
      </div>
      <div v-if="!paged.length" class="py-14 text-center text-sm text-text-secondary">暂无模型（点击同步从 1Panel 拉取）</div>
      <div v-for="m in paged" :key="m.id" class="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.6fr] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="font-medium text-text">{{ m.model_name }}</div>
        <div class="text-text-secondary">{{ m.group_name }}</div>
        <div class="text-text-secondary">{{ m.provider }}</div>
        <div class="text-text-secondary text-xs">{{ m.model_type }}</div>
        <div><span class="px-2 py-0.5 rounded-full text-xs" :class="m.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">{{ m.is_active ? '启用' : '停用' }}</span></div>
      </div>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 text-sm text-text-secondary">
      <span>共 {{ totalModels }} 个模型</span>
      <div class="flex items-center gap-1.5">
        <button @click="page = 1" :disabled="page <= 1" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">«</button>
        <button @click="page--" :disabled="page <= 1" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">‹</button>
        <span class="px-2 text-text-secondary">{{ page }} / {{ totalPages }}</span>
        <button @click="page++" :disabled="page >= totalPages" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">›</button>
        <button @click="page = totalPages" :disabled="page >= totalPages" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">»</button>
      </div>
      <select v-model.number="pageSize" @change="page = 1" class="px-2.5 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-lg text-[13px] bg-white outline-none cursor-pointer">
        <option :value="10">10 条/页</option>
        <option :value="20">20 条/页</option>
        <option :value="50">50 条/页</option>
      </select>
    </div>
    <!-- Toast -->
    <Teleport to="body">
      <div v-if="toast.show" class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg transition-all" :class="toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'" @click="toast.show = false">
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, Search } from 'lucide-vue-next'
import { API_BASE, getLoginToken } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'

const router = useRouter()
const getToken = () => getLoginToken()

const allModels = ref([])
const loading = ref(false)
const syncing = ref(false)
const page = ref(1)
const pageSize = ref(20)
const searchQuery = ref('')
const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allModels.value
  return allModels.value.filter(m =>
    String(m.model_name || '').toLowerCase().includes(q) ||
    String(m.group_name || '').toLowerCase().includes(q) ||
    String(m.provider || '').toLowerCase().includes(q)
  )
})

const totalModels = computed(() => filtered.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalModels.value / pageSize.value)))
const paged = computed(() => {
  // 夹紧 page，防止过滤/pageSize 变化后 page 越界导致空表
  const p = Math.min(page.value, totalPages.value)
  const start = (p - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// 搜索变化时回到第一页
import { watch } from 'vue'
watch(searchQuery, () => { page.value = 1 })

async function fetchModels() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/models`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    // /api/models 返回 { groups: [{name, provider, models:[...]}, ...] }
    // 展平成扁平列表
    const list = []
    for (const g of (data.groups || [])) {
      for (const m of (g.models || [])) {
        list.push(m)
      }
    }
    allModels.value = list
    page.value = 1
  } catch (err) {
    console.error('[AdminModelsView] 加载失败:', err.message)
  } finally {
    loading.value = false
  }
}

async function syncAll() {
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
    if (!res.ok) throw new Error(data.error || '同步失败')
    showToast('同步完成', 'success')
    await fetchModels()
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

onMounted(() => { loadPermissions(); fetchModels() })
</script>
