<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">模型管理</h1>
        <p class="text-text-secondary text-sm mt-1">模型来自 1Panel 同步</p>
      </div>
      <div class="flex gap-3">
        <button @click="syncMcps" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': syncing }" />{{ syncing ? '同步中...' : '同步' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.6fr] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>模型名称</div><div>模型组</div><div>供应商</div><div>类型</div><div>状态</div>
      </div>
      <div v-if="!models.length" class="py-14 text-center text-sm text-text-secondary">暂无模型（点击同步从 1Panel 拉取）</div>
      <div v-for="m in models" :key="m.id" class="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.6fr] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="font-medium text-text">{{ m.model_name }}</div>
        <div class="text-text-secondary">{{ m.group_name }}</div>
        <div class="text-text-secondary">{{ m.provider }}</div>
        <div class="text-text-secondary text-xs">{{ m.model_type }}</div>
        <div><span class="px-2 py-0.5 rounded-full text-xs" :class="m.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">{{ m.is_active ? '启用' : '停用' }}</span></div>
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

const models = ref([])
const loading = ref(false)
const syncing = ref(false)
const toast = ref({ show: false, message: '', type: 'success' })

async function fetchModels() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/models`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    models.value = data.data || []
  } catch (err) {
    console.error('[AdminModelsView] 加载失败:', err.message)
    showToast('加载模型列表失败', 'error')
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
    console.log('[AdminModelsView] sync-now 结果:', data)
    showToast('同步完成', 'success')
    await fetchModels()
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

onMounted(fetchModels)
</script>
