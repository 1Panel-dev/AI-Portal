<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">标签管理</h1>
        <p class="text-text-secondary text-sm mt-1">统一管理模型、Skill、MCP 等资源可复用的标签</p>
      </div>
      <button v-if="can('tag:create')" @click="openCreate" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-primary"><Plus class="w-4 h-4" />新建标签</button>
    </div>

    <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
    <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.3fr_1.2fr_80px_100px_120px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]"><div>标签名称</div><div>适用资源</div><div>排序</div><div>状态</div><div class="text-right">操作</div></div>
      <div v-if="!tags.length" class="py-14 text-center text-sm text-text-secondary">暂无标签</div>
      <div v-for="tag in tags" :key="tag.id" class="grid grid-cols-[1.3fr_1.2fr_80px_100px_120px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div><span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium" :style="tagStyle(tag)">{{ tag.name }}</span><span class="ml-2 text-xs text-text-tertiary">{{ tag.color }}</span></div>
        <div class="flex flex-wrap gap-1.5"><span v-for="type in tag.resource_types" :key="type" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" :style="{ color: tag.color, borderColor: `${tag.color}30`, backgroundColor: `${tag.color}08` }"><component :is="resourceTypeIcon(type)" class="w-3 h-3" />{{ resourceTypeLabel(type) }}</span></div>
        <div class="text-text-secondary">{{ tag.sort_order }}</div>
        <div>
          <button
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            :class="tag.is_active ? 'bg-accent' : 'bg-black/15'"
            :disabled="!can('tag:edit')"
            :title="tag.is_active ? '点击停用' : '点击启用'"
            @click="toggleActive(tag)"
          >
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform" :class="tag.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'" />
          </button>
        </div>
        <div class="flex items-center justify-end gap-2"><button v-if="can('tag:edit')" class="p-2 text-text-secondary hover:text-accent" title="编辑" @click="openEdit(tag)"><Pencil class="w-4 h-4" /></button><button v-if="can('tag:delete')" class="p-2 text-text-secondary hover:text-red-500" title="删除" @click="deleting = tag"><Trash2 class="w-4 h-4" /></button></div>
      </div>
    </div>

    <AppDialog :open="!!editing" :title="editing?.id ? '编辑标签' : '新建标签'" size="lg" static @close="closeDialog">
      <div class="space-y-5">
        <!-- 标签名称 + 排序 -->
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-text mb-2">标签名称</label>
            <input v-model="form.name" maxlength="50" class="tag-input" placeholder="输入标签名称" />
          </div>
          <div class="w-28">
            <label class="block text-sm font-medium text-text mb-2">排序</label>
            <input v-model.number="form.sort_order" type="number" min="0" class="tag-input" placeholder="0" />
          </div>
        </div>

        <!-- 标签颜色 -->
        <div>
          <label class="block text-sm font-medium text-text mb-2">标签颜色</label>
          <div class="flex items-center gap-3">
            <div class="relative shrink-0">
              <input v-model="form.color" type="color" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div class="w-10 h-10 rounded-lg border-2 border-black/10 shadow-sm" :style="{ backgroundColor: form.color }"></div>
            </div>
            <input v-model="form.color" class="tag-input flex-1" placeholder="#005eeb" />
            <span class="shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium border border-black/5" :style="{ color: form.color, backgroundColor: `${form.color}15` }">{{ form.name || '预览' }}</span>
          </div>
        </div>

        <!-- 适用资源类型（下拉多选） -->
        <div>
          <label class="block text-sm font-medium text-text mb-2">适用资源类型 <span class="text-red-400">*</span></label>
          <div class="relative" ref="dropdownRef" @click.stop>
            <button type="button" class="tag-input w-full text-left flex items-center justify-between" @click.stop="dropdownOpen = !dropdownOpen">
              <span v-if="selectedTypes.length === resourceTypes.length && resourceTypes.length" class="text-text">全部类型</span>
              <span v-else-if="selectedTypes.length" class="text-text flex flex-wrap gap-1">
                <span v-for="key in selectedTypes" :key="key" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">{{ resourceTypeLabel(key) }}</span>
              </span>
              <span v-else class="text-text-tertiary">请选择资源类型</span>
              <ChevronDown class="w-4 h-4 text-text-tertiary shrink-0 transition-transform" :class="dropdownOpen ? 'rotate-180' : ''" />
            </button>
            <Transition name="menu">
              <div v-if="dropdownOpen" class="absolute z-50 mt-1 w-full bg-white border border-black/10 rounded-xl shadow-lg py-1.5 max-h-56 overflow-y-auto">
                <div class="flex items-center gap-2 px-3 py-2 border-b border-black/5 mx-2 mb-1 sticky top-0 bg-white">
                  <button type="button" class="text-xs text-accent hover:text-accent-hover" @click.stop="selectAll">全选</button>
                  <span class="text-text-tertiary">·</span>
                  <button type="button" class="text-xs text-text-tertiary hover:text-text-secondary" @click.stop="selectedTypes = []">清空</button>
                </div>
                <label v-for="type in resourceTypes" :key="type.key" class="flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg cursor-pointer hover:bg-black/[0.03] transition-colors" :class="selectedTypes.includes(type.key) ? 'text-accent font-medium' : 'text-text-secondary'" @click.stop>
                  <span class="inline-flex items-center justify-center w-4 h-4 rounded border transition-colors" :class="selectedTypes.includes(type.key) ? 'bg-accent border-accent' : 'border-black/20 bg-white'">
                    <svg v-if="selectedTypes.includes(type.key)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <input type="checkbox" :value="type.key" class="sr-only" @change="toggleType(type.key)" :checked="selectedTypes.includes(type.key)" />
                  <component :is="resourceTypeIcon(type.key)" class="w-3.5 h-3.5 opacity-60" />
                  {{ type.name }}
                </label>
              </div>
            </Transition>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm btn-secondary" @click="closeDialog">取消</button>
        <button class="px-4 py-2 text-sm btn-primary disabled:opacity-50" :disabled="saving || !form.name.trim() || !selectedTypes.length" @click="save">{{ saving ? '保存中...' : '保存' }}</button>
      </template>
    </AppDialog>
    <AppDialog :open="!!deleting" title="确认删除标签" :message="`确定删除标签「${deleting?.name || ''}」吗？`" type="confirm" confirmText="确认删除" @close="deleting = null" @confirm="remove" />
  </div>
</template>

<style scoped>
.tag-input {
  @apply w-full h-10 px-3 text-sm text-text bg-white border border-black/10 rounded-lg outline-none transition-all placeholder:text-text-tertiary;
}
.tag-input:focus {
  @apply border-text/30 ring-2 ring-accent/10;
}
.menu-enter-active, .menu-leave-active { transition: opacity 0.15s, transform 0.15s; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-4px); }
</style>

<script setup>
import { ref, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Pencil, Trash2, ChevronDown, Sun, Puzzle, LayoutGrid } from 'lucide-vue-next'
import AppDialog from '../../components/AppDialog.vue'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'

const router = useRouter()
const token = () => getLoginToken()
const tags = ref([])
const resourceTypes = ref([])
const loading = ref(false)
const saving = ref(false)
const editing = ref(null)
const deleting = ref(null)
const form = ref({ name: '', color: '#005eeb', sort_order: 0, resource_types: [] })

// 下拉多选用独立状态，避免直接修改 form 导致渲染异常
const selectedTypes = ref([])
const dropdownOpen = ref(false)
const dropdownRef = ref(null)

function toggleType(key) {
  const idx = selectedTypes.value.indexOf(key)
  if (idx >= 0) selectedTypes.value.splice(idx, 1)
  else selectedTypes.value.push(key)
}
function selectAll() {
  const all = resourceTypes.value.map(t => t.key)
  selectedTypes.value = selectedTypes.value.length === all.length ? [] : [...all]
}
function closeDialog() { editing.value = null; dropdownOpen.value = false; selectedTypes.value = [] }

function onClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) dropdownOpen.value = false
}

const RESOURCE_TYPE_ICONS = { model: markRaw(Sun), skill: markRaw(Puzzle), mcp: markRaw(LayoutGrid) }
const resourceTypeIcon = key => RESOURCE_TYPE_ICONS[key] || Sun
const resourceTypeLabel = key => resourceTypes.value.find(t => t.key === key)?.name || key
const tagStyle = tag => ({ color: tag.color, backgroundColor: `${tag.color}15` })

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) } })
  if (res.status === 401) { router.push('/admin/login'); throw new Error('登录已过期') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errMsg(data, '操作失败'))
  return data
}
async function fetchTags() { loading.value = true; try { tags.value = (await request('/admin/tags')).data || [] } catch (e) { showToast(e.message || '获取标签失败', 'error') } finally { loading.value = false } }
async function fetchResourceTypes() { try { resourceTypes.value = (await request('/admin/resource-types')).data || [] } catch (e) { showToast(e.message || '获取资源类型失败', 'error') } }
function openCreate() { form.value = { name: '', color: '#005eeb', sort_order: 0, resource_types: [] }; selectedTypes.value = resourceTypes.value.map(t => t.key); editing.value = {} }
function openEdit(tag) { form.value = { name: tag.name, color: tag.color, sort_order: tag.sort_order, resource_types: [...(tag.resource_types || [])] }; selectedTypes.value = [...(tag.resource_types || [])]; editing.value = tag }
async function save() {
  saving.value = true
  try {
    form.value.resource_types = [...selectedTypes.value]
    const path = editing.value.id ? `/admin/tags/${editing.value.id}` : '/admin/tags'
    await request(path, { method: editing.value.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
    editing.value = null; showToast('标签已保存', 'success'); await fetchTags()
  } catch (e) { showToast(e.message || '保存失败', 'error') } finally { saving.value = false }
}
async function toggleActive(tag) {
  try {
    const r = await request(`/admin/tags/${tag.id}/toggle-active`, { method: 'PATCH' })
    tag.is_active = r.data.is_active
    showToast(tag.is_active ? '已启用' : '已停用', 'success')
  } catch (e) { showToast(e.message || '切换失败', 'error') }
}
async function remove() { if (!deleting.value) return; try { await request(`/admin/tags/${deleting.value.id}`, { method: 'DELETE' }); deleting.value = null; showToast('标签已删除', 'success'); await fetchTags() } catch (e) { showToast(e.message || '删除失败', 'error') } }
onMounted(() => { loadPermissions(); fetchTags(); fetchResourceTypes(); document.addEventListener('mousedown', onClickOutside) })
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>
