<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">MCP 管理</h1>
        <p class="text-text-secondary text-sm mt-1">MCP 资源来自 1Panel 同步</p>
      </div>
      <div class="flex gap-3">
        <button @click="syncMcps" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': syncing }" />{{ syncing ? '同步中...' : '同步' }}
        </button>
      </div>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import { API_BASE } from '../../lib/apiBase'

const router = useRouter()
const getToken = () => localStorage.getItem('admin_token')

const mcps = ref([])
const loading = ref(false)
const syncing = ref(false)
const toast = ref({ show: false, message: '', type: 'success' })

async function fetchMcps() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/mcp/search?page=1&pageSize=1000`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    mcps.value = data.data || []
  } catch (err) {
    console.error('[AdminMcpsView] 加载失败:', err.message)
    showToast('加载 MCP 列表失败', 'error')
  } finally {
    loading.value = false
  }
}

async function syncMcps() {
  syncing.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/panel-config/sync-now`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '同步失败')
    showToast('同步完成', 'success')
    await fetchMcps()
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

onMounted(fetchMcps)
</script>
