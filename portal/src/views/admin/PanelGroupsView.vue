<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">1Panel 授权信息</h1>
        <p class="text-text-secondary text-sm mt-1">同步 1Panel 用户组 / 模型组作只读参考；交集数据从成员 key 的 allowedModels 实时取</p>
      </div>
      <button @click="syncPanelGroups" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': syncing }" />{{ syncing ? '同步中...' : '手动同步' }}
      </button>
    </div>

    <!-- tab: 用户组 / 模型组 -->
    <div class="flex gap-1 border-b border-[rgba(0,0,0,0.06)] mb-6">
      <div
        class="px-4 py-2.5 text-sm cursor-pointer border-b-2 transition-all"
        :class="activeTab === 'userGroups' ? 'text-accent border-accent font-semibold' : 'text-text-secondary border-transparent hover:text-text'"
        @click="activeTab = 'userGroups'"
      >用户组 <span class="text-text-tertiary font-normal">({{ userGroups.length }})</span></div>
      <div
        class="px-4 py-2.5 text-sm cursor-pointer border-b-2 transition-all"
        :class="activeTab === 'modelGroups' ? 'text-accent border-accent font-semibold' : 'text-text-secondary border-transparent hover:text-text'"
        @click="activeTab = 'modelGroups'"
      >模型组 <span class="text-text-tertiary font-normal">({{ modelGroups.length }})</span></div>
    </div>

    <!-- 用户组表 -->
    <div v-if="activeTab === 'userGroups'" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.2fr_0.8fr_0.8fr_1.5fr_0.8fr] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>用户组名</div><div>QPS 限制</div><div>Token 限制</div><div>关联模型组</div><div>API Key 数</div>
      </div>
      <div v-if="!userGroups.length" class="py-14 text-center text-sm text-text-secondary">暂无用户组数据，点击右上角「手动同步」</div>
      <div v-for="g in userGroups" :key="g.panel_group_id" class="grid grid-cols-[1.2fr_0.8fr_0.8fr_1.5fr_0.8fr] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="font-medium text-text">{{ g.name }}</div>
        <div class="text-text-secondary">{{ g.qps_limit ?? 0 }}</div>
        <div class="text-text-secondary">{{ g.token_limit ?? 0 }}</div>
        <div class="flex items-center gap-2 flex-wrap">
          <span v-for="(n, i) in (g.model_group_names || [])" :key="i" class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{{ n }}</span>
          <span v-if="!(g.model_group_names || []).length" class="text-xs text-text-tertiary">-</span>
        </div>
        <div class="text-text-secondary">{{ g.api_key_count ?? 0 }}</div>
      </div>
    </div>

    <!-- 模型组表 -->
    <div v-if="activeTab === 'modelGroups'" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.2fr_2fr_1fr] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>模型组名</div><div>包含模型</div><div>选择策略</div>
      </div>
      <div v-if="!modelGroups.length" class="py-14 text-center text-sm text-text-secondary">暂无模型组数据，点击右上角「手动同步」</div>
      <div v-for="g in modelGroups" :key="g.panel_group_id" class="grid grid-cols-[1.2fr_2fr_1fr] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="font-medium text-text">{{ g.name }}</div>
        <div class="flex items-center gap-2 flex-wrap">
          <span v-for="(m, i) in (g.models || [])" :key="i" class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{{ typeof m === 'string' ? m : (m.name || m.model || JSON.stringify(m)) }}</span>
          <span v-if="!(g.models || []).length" class="text-xs text-text-tertiary">-</span>
        </div>
        <div class="text-text-secondary">{{ g.selection_strategy || '-' }}</div>
      </div>
    </div>

    <p class="text-xs text-text-tertiary mt-3">最近同步：{{ lastSyncedAt }} · 同步语义沿用保守策略（空响应不清表）</p>

    <!-- Toast -->
    <Teleport to="body">
      <div v-if="toast.show" class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-fade-up" :class="toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'" @click="toast.show = false">
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import { API_BASE } from '../../lib/apiBase'

const router = useRouter()
const getToken = () => localStorage.getItem('admin_token')

const activeTab = ref('userGroups')
const userGroups = ref([])
const modelGroups = ref([])
const syncing = ref(false)

const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

const lastSyncedAt = computed(() => {
  const times = [...userGroups.value, ...modelGroups.value].map(g => g.synced_at).filter(Boolean)
  if (!times.length) return '-'
  return new Date(times.sort().slice(-1)[0]).toLocaleString('zh-CN')
})

async function fetchPanelGroups() {
  try {
    const res = await fetch(`${API_BASE}/admin/panel-groups`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取 1Panel 授权信息失败')
    userGroups.value = data.data?.userGroups || []
    modelGroups.value = data.data?.modelGroups || []
  } catch (err) {
    showToast(err.message || '获取 1Panel 授权信息失败', 'error')
  }
}

async function syncPanelGroups() {
  if (syncing.value) return
  syncing.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/panel-groups/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.reason || '同步失败')
    const r = data.data || {}
    showToast(`同步完成：用户组 ${r.userGroups ?? 0} · 模型组 ${r.modelGroups ?? 0}`, 'success')
    await fetchPanelGroups()
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

onMounted(fetchPanelGroups)
onUnmounted(() => { if (toastTimer) clearTimeout(toastTimer) })
</script>
