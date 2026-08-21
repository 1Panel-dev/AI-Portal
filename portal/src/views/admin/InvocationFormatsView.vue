<template>
  <div>
    <div v-if="!embedded" class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">调用方式管理</h1>
        <p class="text-text-secondary text-sm mt-1">统一维护模型可用的调用方式，编辑模型时从此处配置的列表中勾选</p>
      </div>
      <button v-if="can('invocation_format:create')" @click="openCreate" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-primary"><Plus class="w-4 h-4" />新建调用方式</button>
    </div>
    <div v-else class="flex items-center justify-end mb-4">
      <button v-if="can('invocation_format:create')" @click="openCreate" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-primary"><Plus class="w-4 h-4" />新建调用方式</button>
    </div>

    <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.2fr_80px_1.5fr_80px_100px_120px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>名称</div>
        <div>方法</div>
        <div>端点</div>
        <div>排序</div>
        <div>状态</div>
        <div class="text-right">操作</div>
      </div>
      <div v-if="!items.length" class="py-14 text-center text-sm text-text-secondary">暂无调用方式</div>
      <div v-for="item in items" :key="item.id" class="grid grid-cols-[1.2fr_80px_1.5fr_80px_100px_120px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="font-medium text-text">{{ item.name }}</div>
        <div>
          <span class="inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium" :class="item.method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'">{{ item.method }}</span>
        </div>
        <div class="font-mono text-xs text-text-secondary truncate">{{ item.endpoint }}</div>
        <div class="text-text-secondary">{{ item.sort_order }}</div>
        <div>
          <button
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            :class="item.is_active ? 'bg-accent' : 'bg-black/15'"
            :disabled="!can('invocation_format:edit')"
            :title="item.is_active ? '点击停用' : '点击启用'"
            @click="toggleActive(item)"
          >
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform" :class="item.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'" />
          </button>
        </div>
        <div class="flex items-center justify-end gap-2">
          <button v-if="can('invocation_format:edit')" class="p-2 text-text-secondary hover:text-accent" title="编辑" @click="openEdit(item)"><Pencil class="w-4 h-4" /></button>
          <button v-if="can('invocation_format:delete')" class="p-2 text-text-secondary hover:text-red-500" title="删除" @click="deleting = item"><Trash2 class="w-4 h-4" /></button>
        </div>
      </div>
    </div>

    <AppDialog :open="!!editing" :title="editing?.id ? '编辑调用方式' : '新建调用方式'" size="lg" @close="closeDialog">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-text mb-2">名称 <span class="text-red-400">*</span></label>
          <input v-model="form.name" maxlength="100" class="fmt-input" placeholder="如 Chat Completions" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-text mb-2">HTTP 方法 <span class="text-red-400">*</span></label>
            <select v-model="form.method" class="fmt-input">
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-text mb-2">排序</label>
            <input v-model.number="form.sort_order" type="number" min="0" class="fmt-input" placeholder="0" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-2">端点</label>
          <input v-model="form.endpoint" maxlength="255" class="fmt-input font-mono text-xs" placeholder="/v1/chat/completions（可为空）" />
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm btn-secondary" @click="closeDialog">取消</button>
        <button class="px-4 py-2 text-sm btn-primary disabled:opacity-50" :disabled="saving || !form.name.trim()" @click="save">{{ saving ? '保存中...' : '保存' }}</button>
      </template>
    </AppDialog>
    <AppDialog :open="!!deleting" title="确认删除" :message="`确定删除调用方式「${deleting?.name || ''}」吗？已关联的模型不受影响。`" type="confirm" confirmText="确认删除" @close="deleting = null" @confirm="remove" />
  </div>
</template>

<style scoped>
.fmt-input {
  @apply w-full h-10 px-3 text-sm text-text bg-white border border-black/10 rounded-lg outline-none transition-all placeholder:text-text-tertiary;
}
.fmt-input:focus {
  @apply border-text/30 ring-2 ring-accent/10;
}
</style>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Pencil, Trash2 } from 'lucide-vue-next'
import AppDialog from '../../components/AppDialog.vue'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'

const router = useRouter()
const token = () => getLoginToken()
const items = ref([])
const loading = ref(false)
const saving = ref(false)
const editing = ref(null)
const deleting = ref(null)
const form = ref({ name: '', method: 'POST', endpoint: '', sort_order: 0 })

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) } })
  if (res.status === 401) { router.push('/admin/login'); throw new Error('登录已过期') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errMsg(data, '操作失败'))
  return data
}

async function fetchItems() {
  loading.value = true
  try { items.value = (await request('/admin/invocation-formats')).data || [] } catch (e) { showToast(e.message || '获取失败', 'error') } finally { loading.value = false }
}

function openCreate() { form.value = { name: '', method: 'POST', endpoint: '', sort_order: 0 }; editing.value = {} }
function openEdit(item) { form.value = { name: item.name, method: item.method, endpoint: item.endpoint, sort_order: item.sort_order }; editing.value = item }
function closeDialog() { editing.value = null }

async function save() {
  saving.value = true
  try {
    const path = editing.value.id ? `/admin/invocation-formats/${editing.value.id}` : '/admin/invocation-formats'
    await request(path, { method: editing.value.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
    editing.value = null; showToast('调用方式已保存', 'success'); await fetchItems()
  } catch (e) { showToast(e.message || '保存失败', 'error') } finally { saving.value = false }
}

async function toggleActive(item) {
  try {
    const r = await request(`/admin/invocation-formats/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !item.is_active }) })
    item.is_active = r.data.is_active
    showToast(item.is_active ? '已启用' : '已停用', 'success')
  } catch (e) { showToast(e.message || '切换失败', 'error') }
}

async function remove() {
  if (!deleting.value) return
  try {
    await request(`/admin/invocation-formats/${deleting.value.id}`, { method: 'DELETE' })
    deleting.value = null; showToast('已删除', 'success'); await fetchItems()
  } catch (e) { showToast(e.message || '删除失败', 'error') }
}

onMounted(() => { loadPermissions(); fetchItems() })
</script>
