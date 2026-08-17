<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">MCP 管理</h1>
        <p class="text-text-secondary text-sm mt-1">MCP 资源来自 1Panel 同步，共 {{ total }} 个</p>
      </div>
      <div class="flex gap-3">
        <button v-if="can('system:config')" @click="syncMcps" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50">
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
          placeholder="搜索 MCP 名称或类型..."
          class="w-full pl-10 pr-4 py-2 bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text transition-all"
          @keyup.enter="goPage(1)"
        >
      </div>
      <button @click="goPage(1)" class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-all">搜索</button>
    </div>

    <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.5fr_1fr_1fr_0.8fr] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>名称</div><div>类型</div><div>1Panel ID</div><div>状态</div>
      </div>
      <div v-if="!mcps.length" class="py-14 text-center text-sm text-text-secondary">暂无 MCP（点击同步从 1Panel 拉取）</div>
      <div v-for="m in mcps" :key="m.id" class="grid grid-cols-[1.5fr_1fr_1fr_0.8fr] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="font-medium text-text truncate">{{ m.name }}</div>
        <div class="text-text-secondary">{{ m.type || '-' }}</div>
        <div class="text-text-tertiary text-xs truncate">{{ m.panel_mcp_id }}</div>
        <div><span class="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-600">同步</span></div>
      </div>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 text-sm text-text-secondary">
      <span>共 {{ total }} 个 MCP</span>
      <div class="flex items-center gap-1.5">
        <button @click="goPage(1)" :disabled="page <= 1" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">«</button>
        <button @click="goPage(page - 1)" :disabled="page <= 1" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">‹</button>
        <span class="px-2 text-text-secondary">{{ page }} / {{ totalPages }}</span>
        <button @click="goPage(page + 1)" :disabled="page >= totalPages" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">›</button>
        <button @click="goPage(totalPages)" :disabled="page >= totalPages" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">»</button>
      </div>
      <select v-model.number="pageSize" @change="goPage(1)" class="px-2.5 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-lg text-[13px] bg-white outline-none cursor-pointer">
        <option :value="10">10 条/页</option>
        <option :value="20">20 条/页</option>
        <option :value="50">50 条/页</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, Search } from 'lucide-vue-next'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'

const router = useRouter()
const getToken = () => getLoginToken()

const mcps = ref([])
const loading = ref(false)
const syncing = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchQuery = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

async function fetchMcps() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
    if (searchQuery.value.trim()) params.set('q', searchQuery.value.trim())
    const res = await fetch(`${API_BASE}/mcp/search?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    mcps.value = data.data || []
    total.value = data.pagination?.total || mcps.value.length
  } catch (err) {
    console.error('[AdminMcpsView] 加载失败:', err.message)
  } finally {
    loading.value = false
  }
}

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  fetchMcps()
}

async function syncMcps() {
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
    await fetchMcps()
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

onMounted(() => { loadPermissions(); fetchMcps() })
</script>
