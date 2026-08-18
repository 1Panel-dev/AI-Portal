<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">资源组管理</h1>
        <p class="text-text-secondary text-sm mt-1">把模型 / Skill / MCP 打包成资源组，授权给成员</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="fetchGroups" :disabled="loading" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary transition-all disabled:opacity-50">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />刷新
        </button>
        <button v-if="can('group:create')" @click="openNew" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-primary transition-all">
          <Plus class="w-4 h-4" />新建资源组
        </button>
      </div>
    </div>

    <div v-if="loading && !groups.length" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.5fr_1fr_1.4fr_1fr_120px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>资源组名</div><div>授权成员</div><div>包含资源</div><div>创建时间</div><div class="text-right">操作</div>
      </div>
      <div v-if="!groups.length" class="py-14 text-center text-sm text-text-secondary">暂无资源组</div>
      <div
        v-for="g in groups"
        :key="g.id"
        class="grid grid-cols-[1.5fr_1fr_1.4fr_1fr_120px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm"
        :class="can('group:edit') ? 'cursor-pointer hover:bg-black/[0.015]' : ''"
        @click="can('group:edit') && $router.push(`/admin/groups/${g.id}`)"
      >
        <div>
          <div class="font-medium text-text">{{ g.name }}</div>
          <div class="text-xs text-text-tertiary">{{ Number(g.member_count) }} 名成员</div>
        </div>
        <div class="text-text-secondary">{{ Number(g.member_count) }}</div>
        <div class="flex items-center gap-2 flex-wrap">
          <template v-for="rc in resourceCountEntries(g.resource_counts)" :key="rc.key">
            <span
              v-if="rc.cnt > 0"
              class="px-2 py-0.5 rounded-full text-xs"
              :class="rc.key === 'model' ? 'bg-[rgba(0,94,235,0.05)] text-accent' : 'bg-slate-100 text-slate-600'"
            >{{ resourceTypeLabel(rc.key) }} {{ rc.cnt }}</span>
          </template>
          <span v-if="!hasResource(g.resource_counts)" class="text-xs text-text-tertiary">—</span>
        </div>
        <div class="text-xs text-text-tertiary">{{ formatDate(g.created_at) }}</div>
        <div class="flex items-center justify-end gap-2">
          <button v-if="can('group:edit')" class="p-2 text-text-secondary hover:text-accent transition-all" title="编辑" @click.stop="$router.push(`/admin/groups/${g.id}`)"><Pencil class="w-4 h-4" /></button>
          <button v-if="can('group:delete')" class="p-2 text-text-secondary hover:text-red-500 transition-all" title="删除" @click.stop="confirmDelete(g)"><Trash2 class="w-4 h-4" /></button>
        </div>
      </div>
    </div>

    <!-- 新建资源组弹框 -->
    <AppDialog :open="showNew" title="新建资源组" size="md" @close="showNew = false">
      <div class="space-y-3">
        <div>
          <label class="block text-sm text-text mb-1.5">资源组名称</label>
          <input
            v-model="newName"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
            placeholder="如：研发一组"
          />
        </div>
        <div>
          <label class="block text-sm text-text mb-1.5">描述（可选）</label>
          <input
            v-model="newDesc"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
            placeholder="资源组用途说明"
          />
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm btn-secondary" @click="showNew = false">取消</button>
        <button class="px-4 py-2 text-sm btn-primary disabled:opacity-50" :disabled="creating || !newName.trim()" @click="create">{{ creating ? '创建中...' : '创建' }}</button>
      </template>
    </AppDialog>

    <!-- 删除确认弹框 -->
    <AppDialog
      :open="!!deletingGroup"
      title="确认删除资源组"
      :message="`确定删除资源组「${deletingGroup?.name || ''}」吗？该组下所有资源与成员关联将一并清除。`"
      type="confirm"
      confirmText="确认删除"
      @close="deletingGroup = null"
      @confirm="doDelete"
    />

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'
import AppDialog from '../../components/AppDialog.vue'

const router = useRouter()
const getToken = () => getLoginToken()

const groups = ref([])
const loading = ref(false)
const showNew = ref(false)
const newName = ref('')
const newDesc = ref('')
const creating = ref(false)
const deletingGroup = ref(null)
const deleting = ref(false)

// resource_counts 形态: [{"model":3},{"skill":1}] 或 null。展平成 [{key,cnt}]
function resourceCountEntries(rc) {
  if (!Array.isArray(rc)) return []
  const out = []
  for (const obj of rc) {
    if (!obj || typeof obj !== 'object') continue
    for (const [key, cnt] of Object.entries(obj)) {
      if (key && cnt != null) out.push({ key, cnt: Number(cnt) })
    }
  }
  return out
}
function hasResource(rc) {
  return resourceCountEntries(rc).some(e => e.cnt > 0)
}
function resourceTypeLabel(key) {
  return { model: '模型', skill: 'Skill', mcp: 'MCP' }[key] || key
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : '-'
}

async function fetchGroups() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/groups`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取资源组失败'))
    groups.value = data.data || []
  } catch (err) {
    showToast(err.message || '获取资源组失败', 'error')
  } finally {
    loading.value = false
  }
}

function openNew() {
  newName.value = ''
  newDesc.value = ''
  showNew.value = true
}

async function create() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/groups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.value, description: newDesc.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '创建失败'))
    showNew.value = false
    showToast('资源组已创建', 'success')
    // 创建后直接跳编辑页配置资源/成员; 仅拿不到 id 停留本页时才刷新列表(避免跳转前白打一次)
    if (data.data && data.data.id) router.push(`/admin/groups/${data.data.id}`)
    else await fetchGroups()
  } catch (err) {
    showToast(err.message || '创建失败', 'error')
  } finally {
    creating.value = false
  }
}

function confirmDelete(g) { deletingGroup.value = g }

async function doDelete() {
  if (!deletingGroup.value) return
  if (deleting.value) return  // 防重复提交
  deleting.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/groups/${deletingGroup.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '删除失败'))
    deletingGroup.value = null
    showToast('资源组已删除', 'success')
    await fetchGroups()
  } catch (err) {
    showToast(err.message || '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(() => { loadPermissions(); fetchGroups() })
</script>
