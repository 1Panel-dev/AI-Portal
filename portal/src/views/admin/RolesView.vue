<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">角色权限</h1>
        <p class="text-text-secondary text-sm mt-1">角色管「能做什么操作」，与资源组（看到什么资源）不耦合。权限粒度 = 模块 × CRUD</p>
      </div>
      <button v-if="can('role:create')" @click="openNew" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all">
        <Plus class="w-4 h-4" />新建角色
      </button>
    </div>

    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.2fr_2.5fr_1fr_100px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>角色</div><div>权限范围</div><div>用户数</div><div class="text-right">操作</div>
      </div>
      <div v-if="loading && !roles.length" class="py-14 text-center text-sm text-text-secondary">加载中...</div>
      <div v-else-if="!roles.length" class="py-14 text-center text-sm text-text-secondary">暂无角色</div>
      <div v-for="r in roles" :key="r.id" class="grid grid-cols-[1.2fr_2.5fr_1fr_100px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium text-text">{{ r.name }}</span>
          <span v-if="r.is_system" class="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600">内置</span>
        </div>
        <div class="text-xs text-text-tertiary truncate">{{ formatPermissions(r.permissions) }}</div>
        <div class="text-text-secondary">{{ r.user_count }}</div>
        <div class="flex items-center justify-end gap-2">
          <button class="p-2 text-text-secondary hover:text-accent transition-all" title="编辑" @click="openEdit(r)"><Pencil class="w-4 h-4" /></button>
          <button v-if="!r.is_system" class="p-2 text-text-secondary hover:text-red-500 transition-all" title="删除" @click="confirmDelete(r)"><Trash2 class="w-4 h-4" /></button>
        </div>
      </div>
    </div>

    <!-- 新建/编辑角色弹框 -->
    <AppDialog :open="showDialog" :title="editingRole ? '编辑角色' : '新建角色'" size="lg" @close="closeDialog">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-text mb-1.5">角色名</label>
          <input
            v-model="formName"
            :disabled="editingRole?.is_system"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary disabled:bg-surface-secondary disabled:text-text-secondary disabled:cursor-not-allowed"
            placeholder="角色名称"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-text mb-1.5">描述</label>
          <input
            v-model="formDesc"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
            placeholder="描述（可选）"
          />
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-text">权限勾选</label>
            <span v-if="editingRole?.is_system" class="text-xs text-amber-600">内置角色权限集不可修改</span>
          </div>
          <div class="space-y-3 max-h-[280px] overflow-y-auto border border-[rgba(0,0,0,0.06)] rounded-lg p-3 bg-surface-secondary">
            <div v-for="group in permissionGroups" :key="group.module">
              <div class="text-xs font-semibold text-text-secondary mb-1.5">{{ groupLabel(group.module) }}</div>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="perm in group.permissions" :key="perm.key"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none"
                  :class="selectedPerms.has(perm.key) ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                  :title="perm.name"
                >
                  <input
                    type="checkbox"
                    :checked="selectedPerms.has(perm.key)"
                    :disabled="editingRole?.is_system"
                    class="hidden"
                    @change="togglePerm(perm.key)"
                  />
                  {{ perm.name }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary" @click="closeDialog">取消</button>
        <button class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50" :disabled="saving || !formName.trim()" @click="saveRole">{{ saving ? '保存中...' : '保存' }}</button>
      </template>
    </AppDialog>

    <!-- 删除确认弹框 -->
    <AppDialog
      :open="!!deletingRole"
      :title="'确认删除角色'"
      :message="`确定删除角色「${deletingRole?.name || ''}」吗？该角色下所有用户关联将一并清除。`"
      type="confirm"
      confirmText="确认删除"
      @close="deletingRole = null"
      @confirm="doDelete"
    />

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
import { Plus, Pencil, Trash2 } from 'lucide-vue-next'
import { API_BASE } from '../../lib/apiBase'
import AppDialog from '../../components/AppDialog.vue'
import { loadPermissions, can } from '../../composables/usePermissions.js'

const router = useRouter()
const getToken = () => localStorage.getItem('admin_token')

const roles = ref([])
const allPermissions = ref([])  // { id, module, action, key, name }
const loading = ref(false)
const showDialog = ref(false)
const editingRole = ref(null)     // null = 新建, 非 null = 编辑
const formName = ref('')
const formDesc = ref('')
const selectedPerms = ref(new Set())
const saving = ref(false)
const deletingRole = ref(null)
const deleting = ref(false)

const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

// 权限按 module 分组
const permissionGroups = computed(() => {
  const map = {}
  for (const p of allPermissions.value) {
    if (!map[p.module]) map[p.module] = { module: p.module, permissions: [] }
    map[p.module].permissions.push(p)
  }
  return Object.values(map)
})

function groupLabel(module) {
  const labels = {
    model: '模型', key: 'API Key', skill: '技能', mcp: 'MCP',
    user: '用户', role: '角色', group: '资源组', system: '系统',
  }
  return labels[module] || module
}

function formatPermissions(perms) {
  if (!Array.isArray(perms) || !perms.length) return '无权限'
  return perms.join(' · ')
}

function togglePerm(key) {
  if (editingRole.value?.is_system) return
  const newSet = new Set(selectedPerms.value)
  if (newSet.has(key)) newSet.delete(key)
  else newSet.add(key)
  selectedPerms.value = newSet
}

async function fetchRoles() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/roles`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    if (res.status === 403) {
      showToast('无角色查看权限', 'error')
      return router.replace('/admin')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取角色列表失败')
    roles.value = data.data || []
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

async function fetchPermissions() {
  try {
    const res = await fetch(`${API_BASE}/admin/permissions`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) return
    const data = await res.json().catch(() => ({}))
    allPermissions.value = data.data || []
  } catch {}
}

function openNew() {
  editingRole.value = null
  formName.value = ''
  formDesc.value = ''
  selectedPerms.value = new Set()
  showDialog.value = true
}

function openEdit(role) {
  editingRole.value = role
  formName.value = role.name
  formDesc.value = role.description || ''
  selectedPerms.value = new Set(role.permissions || [])
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingRole.value = null
}

async function saveRole() {
  if (!formName.value.trim()) return
  await doSaveRole()
}

async function doSaveRole() {
  saving.value = true
  try {
    const isEdit = !!editingRole.value
    const id = editingRole.value?.id
    const isSystem = editingRole.value?.is_system
    const keys = [...selectedPerms.value]

    if (isEdit) {
      // 编辑：分两步存基本信息 + 权限集（内置角色只存基本信息）
      const body = { description: formDesc.value }
      if (!isSystem) {
        // 非内置角色更新 name
        body.name = formName.value
      }
      const baseRes = await fetch(`${API_BASE}/admin/roles/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!baseRes.ok) {
        const err = await baseRes.json().catch(() => ({}))
        throw new Error(err.error || '更新角色失败')
      }
      // 存权限集（内置角色跳过——后端也会拒）
      if (!isSystem) {
        const permRes = await fetch(`${API_BASE}/admin/roles/${id}/permissions`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
        })
        if (!permRes.ok) {
          const err = await permRes.json().catch(() => ({}))
          throw new Error(err.error || '更新权限位失败')
        }
      }
      showToast('角色已更新', 'success')
    } else {
      // 新建
      const res = await fetch(`${API_BASE}/admin/roles`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.value, description: formDesc.value, keys }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || '新建角色失败')
      }
      showToast('角色已创建', 'success')
    }

    closeDialog()
    await fetchRoles()
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

function confirmDelete(role) { deletingRole.value = role }

async function doDelete() {
  if (!deletingRole.value || deleting.value) return
  deleting.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/roles/${deletingRole.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '删除失败')
    deletingRole.value = null
    showToast('角色已删除', 'success')
    await fetchRoles()
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  await loadPermissions()
  fetchRoles()
  fetchPermissions()
})
onUnmounted(() => { if (toastTimer) clearTimeout(toastTimer) })
</script>