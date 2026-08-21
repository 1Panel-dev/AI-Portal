<template>
  <div>
    <!-- 页面级 Tab：模型管理 / 调用方式管理 -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex gap-1 bg-surface-secondary rounded-lg p-1">
        <button type="button" @click="adminTab = 'models'" class="px-4 py-2 text-sm rounded-lg transition-all font-medium" :class="adminTab === 'models' ? 'bg-white text-accent shadow-card' : 'hover:text-text'">模型管理</button>
        <button v-if="can('invocation_format:view')" type="button" @click="adminTab = 'formats'" class="px-4 py-2 text-sm rounded-lg transition-all font-medium" :class="adminTab === 'formats' ? 'bg-white text-accent shadow-card' : 'hover:text-text'">调用方式管理</button>
      </div>
      <!-- 右侧操作按钮（仅模型视图） -->
      <div v-if="adminTab==='models'" class="flex gap-3">
        <button v-if="selectedIds.length && can('model:edit')" @click="batchTogglePublic(false)" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary">
          <EyeOff class="w-4 h-4" />下架 ({{ selectedIds.length }})
        </button>
        <button v-if="selectedIds.length && can('model:edit')" @click="batchTogglePublic(true)" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary">
          <Eye class="w-4 h-4" />上架 ({{ selectedIds.length }})
        </button>
        <button v-if="selectedIds.length && can('model:edit')" @click="openBatchTag" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-primary">
          <Tags class="w-4 h-4" />批量打标签 ({{ selectedIds.length }})
        </button>
        <button v-if="selectedIds.length && can('model:edit')" @click="openBatchRemoveTag" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary text-red-600 hover:text-red-700 hover:border-red-300">
          <X class="w-4 h-4" />移除标签 ({{ selectedIds.length }})
        </button>
        <button v-if="can('system:config')" @click="syncAll" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary transition-all disabled:opacity-50">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': syncing }" />{{ syncing ? '同步中...' : '同步' }}
        </button>
      </div>
    </div>

    <template v-if="adminTab === 'models'">
      <!-- 模型状态 Tab -->
      <div class="flex gap-2 mb-4">
        <button v-for="tab in statusTabs" :key="tab.key" class="px-4 py-2 text-sm rounded-lg border transition-all" :class="statusTab === tab.key ? 'bg-white text-accent border-accent/30 font-semibold shadow-card' : 'bg-surface-secondary text-text-secondary border-transparent hover:text-text'" @click="statusTab = tab.key">
          {{ tab.label }} <span class="text-xs ml-1 opacity-70">{{ tab.count }}</span>
        </button>
      </div>

    <!-- 搜索 + 筛选 -->
    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input v-model="searchQuery" type="text" placeholder="搜索模型名称、账户或供应商..." class="w-full pl-10 pr-4 py-2 bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text transition-all" />
      </div>
      <select v-model="filterTag" class="h-10 px-3 text-sm bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-lg outline-none">
        <option value="">全部标签</option>
        <option v-for="t in allTags" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </div>

    <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <!-- 表头 -->
      <div class="grid grid-cols-[38px_1.5fr_1fr_1.1fr_60px_100px_50px] gap-2 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)] items-center">
        <div class="flex items-center justify-center">
          <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="rounded border-black/20 text-accent focus:ring-accent/20 w-4 h-4" />
        </div>
        <div>模型名称</div>
        <div>账户 / 供应商</div>
        <div>标签</div>
        <div class="text-center">排序</div>
        <div class="text-center">上架状态</div>
        <div class="text-right">操作</div>
      </div>
      <!-- 空状态 -->
      <div v-if="!paged.length" class="py-14 text-center text-sm text-text-secondary">暂无模型（点击同步从 1Panel 拉取）</div>
      <!-- 行 -->
      <div v-for="(m, i) in paged" :key="m.id" class="grid grid-cols-[38px_1.5fr_1fr_1.1fr_60px_100px_50px] gap-2 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm hover:bg-surface-secondary/50 transition-colors">
        <div class="flex items-center justify-center">
          <input type="checkbox" :value="m.id" v-model="selectedIds" class="rounded border-black/20 text-accent focus:ring-accent/20 w-4 h-4" />
        </div>
        <div>
          <div class="font-medium text-text">{{ m.display_name || m.model_name }}</div>
          <div v-if="m.api_model_name && m.api_model_name !== (m.display_name || m.model_name)" class="text-xs text-text-tertiary mt-0.5">API: {{ m.api_model_name }}</div>
        </div>
        <div class="text-text-secondary text-xs">{{ m.group_name }}<br/>{{ m.provider }}</div>
        <div class="flex flex-wrap gap-1">
          <span v-for="tag in (m.tags || [])" :key="tag.id" class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium" :style="{ color: tag.color, backgroundColor: `${tag.color}15` }">{{ tag.name }}</span>
        </div>
        <div class="text-center text-text-secondary text-xs tabular-nums">{{ m.sort_order || 0 }}</div>
        <div class="flex items-center justify-center">
          <button v-if="can('model:edit')" class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" :class="m.is_public ? 'bg-accent' : 'bg-black/15'" :title="m.is_public ? '点击下架' : '点击上架'" @click="togglePublic(m)">
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform" :class="m.is_public ? 'translate-x-[18px]' : 'translate-x-[3px]'" />
          </button>
          <span v-else class="px-1.5 py-0.5 rounded-full text-[10px]" :class="m.is_public ? 'bg-accent/10 text-accent' : 'bg-black/5 text-text-tertiary'">{{ m.is_public ? '已上架' : '未上架' }}</span>
        </div>
        <div class="flex items-center justify-end">
          <button v-if="can('model:edit')" class="p-1.5 text-text-secondary hover:text-accent transition-colors" title="编辑" @click="openEdit(m)">
            <Pencil class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <Pagination class="mt-6" :page="page" :total-pages="totalPages" :total="totalModels" label="个模型" show-first-last :page-size="pageSize" @change="page = $event" @page-size-change="pageSize = $event" />

    <!-- 编辑弹框 -->
    <AppDialog :open="!!editing" :title="`编辑模型 — ${editing?.model_name || ''}`" size="lg" @close="editing = null">
      <div v-if="editing" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-text mb-1">展示名称</label>
          <input v-model="editForm.display_name" class="model-input" placeholder="对外展示的模型名（默认同步自 1Panel）" />
        </div>
        <div v-if="editing.api_model_name">
          <label class="block text-sm font-medium text-text mb-1">实际调用名 (API)</label>
          <div class="text-sm text-text-secondary bg-surface-secondary rounded-lg px-3 py-2.5 font-mono">{{ editing.api_model_name }}</div>
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">模型描述</label>
          <textarea v-model="editForm.description" rows="3" class="model-input resize-none" placeholder="模型简介，展示在模型卡片上"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div ref="ctxFieldRef" class="relative">
            <label class="block text-sm font-medium text-text mb-1">上下文窗口</label>
            <input type="number" min="0" :value="ctxK" @focus="ctxOpen = true" @input="e => onCtxTyped(e.target.value)" class="model-input !pr-14 font-mono" placeholder="自定义，如 96" />
            <span class="absolute right-10 top-1/2 -translate-y-1/2 text-[11px] font-semibold px-1 py-0.5 rounded bg-surface-secondary text-text-secondary pointer-events-none">K</span>
            <button type="button" @click="ctxOpen = !ctxOpen" class="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text rounded-md transition-colors" tabindex="-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'rotate-180': ctxOpen }" class="transition-transform"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div v-if="ctxOpen" class="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden">
              <div v-for="o in CTX_OPTIONS" :key="o.v" class="flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-surface-secondary" :class="editForm.context_window === o.v ? 'text-accent font-medium' : 'text-text'" @click="ctxPick(o.v)">
                <span>{{ o.label }}</span>
                <svg v-if="editForm.context_window === o.v" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
              </div>
            </div>
          </div>
          <div ref="outFieldRef" class="relative">
            <label class="block text-sm font-medium text-text mb-1">最大输出</label>
            <input type="number" min="0" :value="outK" @focus="outOpen = true" @input="e => onOutTyped(e.target.value)" class="model-input !pr-14 font-mono" placeholder="如 24" />
            <span class="absolute right-10 top-1/2 -translate-y-1/2 text-[11px] font-semibold px-1 py-0.5 rounded bg-surface-secondary text-text-secondary pointer-events-none">K</span>
            <button type="button" @click="outOpen = !outOpen" class="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text rounded-md transition-colors" tabindex="-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'rotate-180': outOpen }" class="transition-transform"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div v-if="outOpen" class="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden">
              <div v-for="o in OUT_OPTIONS" :key="o.v" class="flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-surface-secondary" :class="editForm.max_output_tokens === o.v ? 'text-accent font-medium' : 'text-text'" @click="outPick(o.v)">
                <span>{{ o.label }}</span>
                <svg v-if="editForm.max_output_tokens === o.v" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
              </div>
            </div>
          </div>
        </div>
        <!-- 模型能力（多选） -->
        <div class="flex gap-4 pt-1">
          <label class="inline-flex items-center gap-2 text-sm cursor-pointer select-none" :class="editForm.tool_calling ? 'text-accent font-medium' : 'text-text-secondary'">
            <input type="checkbox" v-model="editForm.tool_calling" class="w-4 h-4 rounded border-black/20 text-accent focus:ring-accent/20" />
            工具调用
          </label>
          <label class="inline-flex items-center gap-2 text-sm cursor-pointer select-none" :class="editForm.image_input ? 'text-accent font-medium' : 'text-text-secondary'">
            <input type="checkbox" v-model="editForm.image_input" class="w-4 h-4 rounded border-black/20 text-accent focus:ring-accent/20" />
            图片输入
          </label>
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">排序</label>
          <input v-model.number="editForm.sort_order" type="number" class="model-input" placeholder="0" />
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-2">调用方式</label>
          <div ref="formatFieldRef" class="relative">
            <button type="button" @click="formatDropdownOpen = !formatDropdownOpen" class="model-input text-left flex items-center justify-between">
              <span class="text-sm" :class="editForm.invocation_formats.length ? 'text-text' : 'text-text-tertiary'">{{ editForm.invocation_formats.length ? `已选 ${editForm.invocation_formats.length} 项` : '选择调用方式' }}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-tertiary transition-transform" :class="{ 'rotate-180': formatDropdownOpen }"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div v-if="formatDropdownOpen" class="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              <label v-for="fmt in allFormats" :key="fmt.id" class="flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary cursor-pointer text-sm">
                <input type="checkbox" :value="fmt.name" v-model="editForm.invocation_formats" class="rounded border-black/20 text-accent focus:ring-accent/20 w-4 h-4 shrink-0" />
                <span class="font-mono text-[11px] px-1 py-0.5 rounded shrink-0" :class="fmt.method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'">{{ fmt.method }}</span>
                <span class="text-xs">{{ fmt.name }}</span>
                <span class="font-mono text-[10px] text-text-tertiary ml-auto truncate">{{ fmt.endpoint }}</span>
              </label>
              <div v-if="!allFormats.length" class="px-3 py-2 text-xs text-text-tertiary">暂无调用方式</div>
            </div>
          </div>
          <div v-if="editForm.invocation_formats.length" class="flex flex-wrap gap-1.5 mt-2">
            <span v-for="name in editForm.invocation_formats" :key="name" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/8 text-accent text-xs font-medium">
              {{ name }}
              <button type="button" @click="editForm.invocation_formats = editForm.invocation_formats.filter(n => n !== name)" class="text-accent/60 hover:text-accent">&times;</button>
            </span>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1">标签</label>
          <div ref="tagFieldRef" class="relative">
            <button type="button" @click="tagDropdownOpen = !tagDropdownOpen" class="model-input text-left flex items-center justify-between">
              <span class="text-sm" :class="editTagIds.length ? 'text-text' : 'text-text-tertiary'">{{ editTagIds.length ? `已选 ${editTagIds.length} 个标签` : '选择标签' }}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-tertiary transition-transform" :class="{ 'rotate-180': tagDropdownOpen }"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div v-if="tagDropdownOpen" class="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              <button v-for="t in allTags" :key="t.id" type="button" @click="toggleEditTag(t.id)" class="flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary cursor-pointer text-sm w-full text-left">
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>
                <span class="text-xs">{{ t.name }}</span>
                <svg v-if="editTagIds.includes(t.id)" class="ml-auto text-accent shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
              </button>
              <div v-if="!allTags.length" class="px-3 py-2 text-xs text-text-tertiary">暂无标签</div>
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
        <button class="px-4 py-2 text-sm btn-secondary" @click="editing = null">取消</button>
        <button class="px-4 py-2 text-sm btn-primary disabled:opacity-50" :disabled="saving" @click="saveEdit">{{ saving ? '保存中...' : '保存' }}</button>
      </template>
    </AppDialog>

    <!-- 批量打标签弹框 -->
    <AppDialog :open="batchTagOpen" :title="`批量打标签 — ${selectedIds.length} 个模型`" size="md" @close="batchTagOpen = false">
      <div class="space-y-4">
        <p class="text-sm text-text-secondary">选择要添加的标签（已有标签不会重复）：</p>
        <div class="flex flex-wrap gap-2">
          <button v-for="t in allTags" :key="t.id" type="button" @click="toggleBatchTag(t.id)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all" :class="batchTagIds.includes(t.id) ? 'border-accent bg-accent/10 text-accent' : 'border-black/10 text-text-secondary hover:border-black/20'">
            <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: t.color }"></span>{{ t.name }}
          </button>
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm btn-secondary" @click="batchTagOpen = false">取消</button>
        <button class="px-4 py-2 text-sm btn-primary disabled:opacity-50" :disabled="batchSaving || !batchTagIds.length" @click="saveBatchTag">{{ batchSaving ? '保存中...' : '确认添加' }}</button>
      </template>
    </AppDialog>

    <!-- 批量移除标签弹框 -->
    <AppDialog :open="removeTagOpen" :title="`移除标签 — ${selectedIds.length} 个模型`" size="md" @close="removeTagOpen = false">
      <div class="space-y-4">
        <p class="text-sm text-text-secondary">选择要移除的标签：</p>
        <div class="flex flex-wrap gap-2">
          <button v-for="t in allTags" :key="t.id" type="button" @click="toggleRemoveTag(t.id)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all" :class="removeTagIds.includes(t.id) ? 'border-red-400 bg-red-50 text-red-600' : 'border-black/10 text-text-secondary hover:border-black/20'">
            <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: t.color }"></span>{{ t.name }}
          </button>
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm btn-secondary" @click="removeTagOpen = false">取消</button>
        <button class="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-all" :disabled="removeSaving || !removeTagIds.length" @click="saveRemoveTag">{{ removeSaving ? '移除中...' : '确认移除' }}</button>
      </template>
    </AppDialog>
    </template>

    <!-- 调用方式管理（嵌入小功能，不开独立菜单） -->
    <template v-else>
      <InvocationFormatsView embedded />
    </template>
  </div>
</template>

<style scoped>
.model-input {
  @apply w-full h-10 px-3 text-sm text-text bg-white border border-black/10 rounded-lg outline-none transition-all placeholder:text-text-tertiary;
}
.model-input:focus {
  @apply border-text/30 ring-2 ring-accent/10;
}
textarea.model-input { @apply h-auto py-2.5; }
</style>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, Search, Pencil, Tags, X, Eye, EyeOff } from 'lucide-vue-next'
import AppDialog from '../../components/AppDialog.vue'
import Pagination from '../../components/Pagination.vue'
import InvocationFormatsView from './InvocationFormatsView.vue'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'

const router = useRouter()
const token = () => getLoginToken()

const allModels = ref([])
const allTags = ref([])
const allFormats = ref([])  // 从 DB 加载的调用方式列表
const loading = ref(false)
const syncing = ref(false)
const page = ref(1)
const pageSize = ref(20)
const searchQuery = ref('')
const filterTag = ref('')
const statusTab = ref('public')
// 页面级视图：模型管理 / 调用方式管理
const adminTab = ref('models')
const statusTabs = computed(() => [
  { key: 'public', label: '已上架', count: allModels.value.filter(m => m.is_public).length },
  { key: 'private', label: '未上架', count: allModels.value.filter(m => !m.is_public).length },
])
const selectedIds = ref([])

// ── 数据拉取 ──
async function request(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { Authorization: `Bearer ${token()}`, ...(opts.headers || {}) } })
  if (res.status === 401) { router.push('/admin/login'); throw new Error('登录已过期') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errMsg(data, '操作失败'))
  return data
}

async function fetchModels() {
  loading.value = true
  try {
    allModels.value = (await request('/admin/models')).data || []
    page.value = 1
    selectedIds.value = []
  } catch (e) { showToast(e.message || '加载失败', 'error') } finally { loading.value = false }
}

async function fetchTags() {
  try { allTags.value = (await request('/admin/tags')).data || [] } catch (_) {}
}

async function fetchFormats() {
  try { allFormats.value = (await request('/admin/invocation-formats')).data || [] } catch (_) {}
}

// ── 搜索 + 筛选 ──
const filtered = computed(() => {
  let list = allModels.value
  const q = searchQuery.value.trim().toLowerCase()
  if (q) list = list.filter(m => String(m.model_name || '').toLowerCase().includes(q) || String(m.group_name || '').toLowerCase().includes(q) || String(m.provider || '').toLowerCase().includes(q))
  if (filterTag.value) list = list.filter(m => (m.tags || []).some(t => t.id === filterTag.value))
  if (statusTab.value === 'public') list = list.filter(m => m.is_public)
  if (statusTab.value === 'private') list = list.filter(m => !m.is_public)
  return list
})
const totalModels = computed(() => filtered.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalModels.value / pageSize.value)))
const paged = computed(() => {
  const p = Math.min(page.value, totalPages.value)
  const start = (p - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})
watch(searchQuery, () => { page.value = 1 })
watch(filterTag, () => { page.value = 1 })
watch(statusTab, () => { page.value = 1 })
// 从「调用方式管理」切回模型编辑时, 刷新下拉数据(内嵌页可能有新增/改名/停用的格式)
watch(adminTab, (v) => { if (v === 'models') { fetchFormats(); fetchTags() } })

// ── 全选 ──
const isAllSelected = computed(() => paged.value.length > 0 && paged.value.every(m => selectedIds.value.includes(m.id)))
function toggleSelectAll() {
  if (isAllSelected.value) {
    const pageIds = new Set(paged.value.map(m => m.id))
    selectedIds.value = selectedIds.value.filter(id => !pageIds.has(id))
  } else {
    const ids = new Set(selectedIds.value)
    for (const m of paged.value) ids.add(m.id)
    selectedIds.value = Array.from(ids)
  }
}

// ── 上架状态开关 ──
async function togglePublic(m) {
  if (!can('model:edit')) return
  try {
    await request(`/admin/models/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !m.is_public }),
    })
    m.is_public = !m.is_public
    showToast(m.is_public ? '已上架' : '已下架', 'success')
  } catch (e) { showToast(e.message || '操作失败', 'error') }
}

async function batchTogglePublic(pub) {
  if (!selectedIds.value.length) return
  try {
    const results = await Promise.allSettled(selectedIds.value.map(id =>
      request(`/admin/models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: pub }),
      })
    ))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const fail = results.length - ok
    // 本地同步成功的状态
    for (const m of allModels.value) {
      if (selectedIds.value.includes(m.id) && results[selectedIds.value.indexOf(m.id)]?.status === 'fulfilled') {
        m.is_public = pub
      }
    }
    if (fail) showToast(`${pub ? '上架' : '下架'} ${ok} 个成功，${fail} 个失败`, 'error')
    else showToast(pub ? `已上架 ${ok} 个模型` : `已下架 ${ok} 个模型`, 'success')
    selectedIds.value = []
  } catch (e) { showToast(e.message || '操作失败', 'error') }
}

// ── 同步 ──
async function syncAll() {
  if (syncing.value) return
  syncing.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/panel-config/sync-now`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } })
    if (res.status === 401) { localStorage.removeItem('admin_token'); return router.push('/admin/login') }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '同步失败'))
    showToast('同步完成', 'success')
    await fetchModels()
  } catch (e) { showToast(e.message || '同步失败', 'error') } finally { syncing.value = false }
}

// ── 编辑模型 ──
const editing = ref(null)
const saving = ref(false)
const editForm = ref({})
const editTagIds = ref([])
const formatDropdownOpen = ref(false)
const tagDropdownOpen = ref(false)
const ctxOpen = ref(false)
const outOpen = ref(false)

// 下拉弹层「点外关闭」：用文档级 mousedown 判定, 不用全屏遮罩(遮罩会挡住滚轮, 导致下拉打开时无法滚动外层弹框)
const ctxFieldRef = ref(null)
const outFieldRef = ref(null)
const formatFieldRef = ref(null)
const tagFieldRef = ref(null)
function onDocMousedown(e) {
  if (ctxFieldRef.value && !ctxFieldRef.value.contains(e.target)) ctxOpen.value = false
  if (outFieldRef.value && !outFieldRef.value.contains(e.target)) outOpen.value = false
  if (formatFieldRef.value && !formatFieldRef.value.contains(e.target)) formatDropdownOpen.value = false
  if (tagFieldRef.value && !tagFieldRef.value.contains(e.target)) tagDropdownOpen.value = false
}

function getTagName(id) {
  return (allTags.value.find(t => t.id === id) || {}).name || ''
}
function getTagColor(id) {
  return (allTags.value.find(t => t.id === id) || {}).color || '#64748b'
}

// 上下文窗口 / 最大输出的预设档位（K 单位），编辑弹窗下拉可选；存量非常规值自动加一个兜底选项
// 上下文窗口 / 最大输出的预设档位（K 单位，十进制定义：32K=32000）
// 档位值、输入框 ÷1000、广场 formatTokens ÷1000 三者一致，避免「128K 显示成 131」的错位
const CTX_OPTIONS = [
  { v: 32000, label: '32K' },
  { v: 64000, label: '64K' },
  { v: 128000, label: '128K' },
  { v: 256000, label: '256K' },
  { v: 1000000, label: '1M' },
]
const OUT_OPTIONS = [
  { v: 8000, label: '8K' },
  { v: 16000, label: '16K' },
  { v: 32000, label: '32K' },
  { v: 64000, label: '64K' },
]
// 上下文窗口 / 最大输出：可编辑输入（K 单位）+ 预设档位弹出菜单
const ctxK = computed(() => {
  const v = editForm.value.context_window
  return v ? Math.round(v / 1000) : ''
})
const outK = computed(() => {
  const v = editForm.value.max_output_tokens
  return v ? Math.round(v / 1000) : ''
})
function onCtxTyped(raw) {
  const num = Math.round(parseFloat(raw) || 0)
  editForm.value.context_window = num * 1000
}
function onOutTyped(raw) {
  const num = Math.round(parseFloat(raw) || 0)
  editForm.value.max_output_tokens = num * 1000
}
function ctxPick(v) { editForm.value.context_window = v; ctxOpen.value = false }
function outPick(v) { editForm.value.max_output_tokens = v; outOpen.value = false }

function openEdit(m) {
  editing.value = m
  const ctxValue = m.context_window || 128000
  const outValue = m.max_output_tokens || 16000
  editForm.value = {
    display_name: m.display_name || m.model_name,
    description: m.description || '',
    context_window: ctxValue,
    max_output_tokens: outValue,
    sort_order: m.sort_order || 0,
    tool_calling: !!m.tool_calling,
    image_input: !!m.image_input,
    invocation_formats: normalizeFormats(m.invocation_formats),
  }
  ctxOpen.value = false
  outOpen.value = false
  // 关闭弹窗时重置下拉状态，避免打开下一个模型时下拉残留展开
  formatDropdownOpen.value = false
  tagDropdownOpen.value = false
  editTagIds.value = (m.tags || []).map(t => t.id)
}

// 把模型存储的调用方式值映射成下拉里的规范名称（兼容旧数据存的是 id/别名/大小写差异），并去重。
// 迁移 046 的默认值是 ["tool"]（占位符），不属于任何真实调用方式，这里直接丢弃。
function normalizeFormats(stored) {
  if (!Array.isArray(stored)) return []
  const seen = new Set()
  const out = []
  for (const v of stored) {
    const s = String(v)
    if (s === 'tool') continue
    const hit =
      allFormats.value.find(f => f.name === s) ||
      allFormats.value.find(f => String(f.id) === s) ||
      allFormats.value.find(f => f.name.toLowerCase() === s.toLowerCase())
    const canonical = hit ? hit.name : s
    if (!seen.has(canonical)) { seen.add(canonical); out.push(canonical) }
  }
  return out
}
function toggleEditTag(id) {
  const idx = editTagIds.value.indexOf(id)
  if (idx >= 0) editTagIds.value.splice(idx, 1)
  else editTagIds.value.push(id)
}

async function saveEdit() {
  saving.value = true
  try {
    await request(`/admin/models/${editing.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm.value),
    })
    try {
      await request(`/admin/model-tags/${editing.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: editTagIds.value }),
      })
    } catch (tagErr) {
      editing.value = null
      showToast('模型信息已保存，但标签更新失败：' + tagErr.message, 'error')
      await fetchModels()
      return
    }
    editing.value = null
    showToast('模型信息已保存', 'success')
    await fetchModels()
  } catch (e) { showToast(e.message || '保存失败', 'error') } finally { saving.value = false }
}

// ── 批量打标签 ──
const batchTagOpen = ref(false)
const batchSaving = ref(false)
const batchTagIds = ref([])

function openBatchTag() { batchTagIds.value = []; batchTagOpen.value = true }
function toggleBatchTag(id) {
  const idx = batchTagIds.value.indexOf(id)
  if (idx >= 0) batchTagIds.value.splice(idx, 1)
  else batchTagIds.value.push(id)
}

async function saveBatchTag() {
  batchSaving.value = true
  try {
    await request('/admin/model-tags/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_ids: selectedIds.value, tag_ids: batchTagIds.value }),
    })
    batchTagOpen.value = false
    showToast('标签已添加', 'success')
    await fetchModels()
  } catch (e) { showToast(e.message || '操作失败', 'error') } finally { batchSaving.value = false }
}

// ── 批量移除标签 ──
const removeTagOpen = ref(false)
const removeSaving = ref(false)
const removeTagIds = ref([])

function openBatchRemoveTag() { removeTagIds.value = []; removeTagOpen.value = true }
function toggleRemoveTag(id) {
  const idx = removeTagIds.value.indexOf(id)
  if (idx >= 0) removeTagIds.value.splice(idx, 1)
  else removeTagIds.value.push(id)
}

async function saveRemoveTag() {
  removeSaving.value = true
  try {
    await request('/admin/model-tags/batch-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_ids: selectedIds.value, tag_ids: removeTagIds.value }),
    })
    removeTagOpen.value = false
    showToast('标签已移除', 'success')
    await fetchModels()
  } catch (e) { showToast(e.message || '操作失败', 'error') } finally { removeSaving.value = false }
}

onMounted(() => {
  loadPermissions(); fetchModels(); fetchTags(); fetchFormats()
  document.addEventListener('mousedown', onDocMousedown)
})
onUnmounted(() => document.removeEventListener('mousedown', onDocMousedown))
</script>
