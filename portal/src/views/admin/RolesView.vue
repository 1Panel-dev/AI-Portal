<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">角色权限</h1>
        <p class="text-text-secondary text-sm mt-1">角色管「能做什么操作」，与资源组（看到什么资源）不耦合。权限粒度 = 模块 × CRUD</p>
      </div>
    </div>

    <div class="flex gap-6 items-start">
      <!-- 左栏：角色列表 -->
      <div class="w-[340px] shrink-0">
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
            <span class="text-sm font-semibold text-text">角色列表</span>
            <button v-if="can('role:create')" @click="startNewRole" class="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium">
              <Plus class="w-3.5 h-3.5" />新建角色
            </button>
          </div>

          <div v-if="loading && !roles.length" class="py-14 text-center text-sm text-text-secondary">加载中...</div>

          <div v-else class="py-2">
            <!-- 内置角色 -->
            <div v-if="builtInRoles.length" class="mb-1">
              <div class="px-4 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">内置角色</div>
              <div
                v-for="r in builtInRoles" :key="r.id"
                class="flex items-center gap-2 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all"
                :class="selectedRole?.id === r.id ? 'bg-accent/5 text-accent border-l-[3px] border-accent rounded-l-none' : 'hover:bg-black/[0.02] text-text'"
                @click="selectRole(r)"
              >
                <span class="text-sm font-medium truncate flex-1">{{ r.name === 'admin' ? '超级管理员' : r.name === 'user' ? '普通用户' : r.name }}</span>
                <span class="shrink-0 px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-600">内置</span>
              </div>
            </div>

            <!-- 分割线 -->
            <div v-if="customRoles.length" class="border-t border-[rgba(0,0,0,0.06)] my-2"></div>

            <!-- 自定义角色 -->
            <div v-if="customRoles.length">
              <div class="px-4 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">自定义角色</div>
              <div
                v-for="r in customRoles" :key="r.id"
                class="flex items-center gap-2 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all group"
                :class="selectedRole?.id === r.id ? 'bg-accent/5 text-accent border-l-[3px] border-accent rounded-l-none' : 'hover:bg-black/[0.02] text-text'"
                @click="selectRole(r)"
              >
                <span class="text-sm font-medium truncate flex-1">{{ r.name }}</span>
                <span class="text-xs text-text-tertiary shrink-0">{{ r.user_count }} 用户</span>
                <button
                  v-if="can('role:delete')"
                  class="shrink-0 p-1 text-text-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="删除"
                  @click.stop="confirmDelete(r)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div v-if="!roles.length" class="py-8 text-center text-sm text-text-tertiary">暂无角色</div>
          </div>
        </div>
      </div>

      <!-- 右栏：权限编辑区 -->
      <div class="flex-1 min-w-0">
        <!-- 未选中任何角色且不是在新建 -->
        <div v-if="!selectedRole && !isCreating" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card p-12 text-center">
          <div class="text-text-tertiary text-sm">请从左侧选择一个角色</div>
        </div>

        <!-- 新建角色 -->
        <div v-else-if="isCreating" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-text">新建角色</h2>
            <button @click="cancelNewRole" class="text-sm text-text-tertiary hover:text-text transition-colors">取消</button>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">角色名 <span class="text-red-500">*</span></label>
                <input
                  v-model="formName"
                  class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
                  placeholder="角色名称"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">继承自</label>
                <select
                  v-model="inheritFrom"
                  class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary cursor-pointer"
                  @change="applyInherit"
                >
                  <option value="custom">自定义（从零开始）</option>
                  <option value="admin">管理员（全部权限）</option>
                  <option value="user">普通用户（默认权限）</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1.5">描述</label>
              <input
                v-model="formDesc"
                class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
                placeholder="描述（可选）"
              />
            </div>
          </div>

          <!-- 权限勾选（左右两栏：菜单列表 + 操作/功能权限） -->
          <div class="mt-6">
            <div class="flex items-center justify-between mb-3">
              <label class="text-sm font-medium text-text">权限设置</label>
            </div>
            <div class="flex gap-4">
              <!-- 左栏：菜单列表 -->
              <div class="w-[200px] shrink-0">
                <div class="text-xs font-semibold text-text mb-2">菜单权限</div>
                <div class="border border-[rgba(0,0,0,0.06)] rounded-lg overflow-hidden">
                  <div
                    class="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-all border-b border-[rgba(0,0,0,0.06)] bg-surface-secondary text-text font-medium"
                    @click="toggleAllMenus"
                  >
                    <input type="checkbox" :checked="allMenusSelected" @click.stop="toggleAllMenus" class="accent-accent shrink-0" />
                    <span>全选</span>
                  </div>
                  <div
                    v-for="m in orderedMenuList" :key="m.key"
                    class="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-all"
                    :class="selectedMenuKey === m.key ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-black/[0.02] text-text'"
                    @click="selectedMenuKey = m.key"
                  >
                    <input type="checkbox" :checked="selectedPerms.has(m.key)" @click.stop="togglePerm(m.key)" class="accent-accent shrink-0" />
                    <span class="truncate">{{ m.name }}</span>
                  </div>
                  <div v-if="!orderedMenuList.length" class="px-3 py-4 text-xs text-text-tertiary text-center">暂无菜单</div>
                </div>
              </div>
              <!-- 右栏：操作/功能权限 -->
              <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-text mb-2">{{ isAdminRole ? '操作权限' : '功能权限' }}</div>
                <div v-if="selectedMenuKey" class="border border-[rgba(0,0,0,0.06)] rounded-lg p-3 min-h-[100px]">
                  <div v-if="selectedMenuOps.length" class="flex flex-wrap gap-2">
                    <div
                      v-for="perm in selectedMenuOps" :key="perm.key"
                      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none transition-all"
                      :class="selectedPerms.has(perm.key) ? 'bg-accent text-white border border-transparent' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                      @click="togglePerm(perm.key)"
                    >
                      {{ perm.name }}
                    </div>
                  </div>
                  <div v-else class="text-xs text-text-tertiary py-6 text-center">该菜单无操作权限</div>
                </div>
                <div v-else class="border border-[rgba(0,0,0,0.06)] rounded-lg p-3 min-h-[100px]">
                  <div class="text-xs text-text-tertiary py-6 text-center">请从左侧选择一个菜单</div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="saveNewRole"
              :disabled="saving || !formName.trim()"
              class="px-6 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-all"
            >
              {{ saving ? '创建中...' : '创建角色' }}
            </button>
          </div>
        </div>

        <!-- 编辑角色 -->
        <div v-else-if="selectedRole" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-card p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-text">{{ displayName(selectedRole) }}</h2>
            <div class="flex items-center gap-2">
              <span v-if="isAdminRole" class="px-2.5 py-1 rounded-full text-xs bg-indigo-50 text-indigo-600">后台角色</span>
              <span v-else class="px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-600">用户侧角色</span>
              <span v-if="selectedRole.is_system" class="px-2.5 py-1 rounded-full text-xs bg-amber-50 text-amber-600">内置角色</span>
            </div>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">角色名</label>
                <input
                  :value="selectedRole.name"
                  disabled
                  class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none bg-surface-secondary text-text-secondary cursor-not-allowed"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text mb-1.5">描述</label>
                <input
                  v-model="formDesc"
                  :disabled="selectedRole.name === 'admin'"
                  class="w-full h-10 px-3 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary disabled:bg-surface-secondary disabled:text-text-secondary disabled:cursor-not-allowed"
                  :class="selectedRole.name === 'admin' ? '' : ''"
                  placeholder="描述"
                />
              </div>
            </div>
          </div>

          <!-- 权限勾选（左右两栏：菜单列表 + 操作/功能权限） -->
          <div class="mt-6">
            <div class="flex items-center justify-between mb-3">
              <label class="text-sm font-medium text-text">权限设置</label>
              <span v-if="selectedRole.is_system" class="text-xs text-amber-600">内置角色权限集不可修改</span>
            </div>
            <div class="flex gap-4">
              <!-- 左栏：菜单列表 -->
              <div class="w-[200px] shrink-0">
                <div class="text-xs font-semibold text-text mb-2">菜单权限</div>
                <div class="border border-[rgba(0,0,0,0.06)] rounded-lg overflow-hidden">
                  <div
                    class="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-all border-b border-[rgba(0,0,0,0.06)] bg-surface-secondary text-text font-medium"
                    :style="selectedRole.is_system ? 'opacity: 0.6;' : ''"
                    @click="!selectedRole.is_system && toggleAllMenus"
                  >
                    <input type="checkbox" :checked="selectedRole.is_system || allMenusSelected" :disabled="selectedRole.is_system" @click.stop="!selectedRole.is_system && toggleAllMenus" class="accent-accent shrink-0" />
                    <span>全选</span>
                  </div>
                  <div
                    v-for="m in orderedMenuList" :key="m.key"
                    class="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-all"
                    :class="selectedMenuKey === m.key ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-black/[0.02] text-text'"
                    :style="selectedRole.is_system ? 'opacity: 0.6;' : ''"
                    @click="selectedMenuKey = m.key"
                  >
                    <input type="checkbox" :checked="selectedRole.is_system || selectedPerms.has(m.key)" :disabled="selectedRole.is_system" @click.stop="!selectedRole.is_system && togglePerm(m.key)" class="accent-accent shrink-0" />
                    <span class="truncate">{{ m.name }}</span>
                  </div>
                  <div v-if="!orderedMenuList.length" class="px-3 py-4 text-xs text-text-tertiary text-center">暂无菜单</div>
                </div>
              </div>
              <!-- 右栏：操作/功能权限 -->
              <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-text mb-2">{{ isAdminRole ? '操作权限' : '功能权限' }}</div>
                <div v-if="selectedMenuKey" class="border border-[rgba(0,0,0,0.06)] rounded-lg p-3 min-h-[100px]">
                  <div v-if="selectedMenuOps.length" class="flex flex-wrap gap-2">
                    <div
                      v-for="perm in selectedMenuOps" :key="perm.key"
                      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer select-none transition-all"
                      :class="selectedPerms.has(perm.key) || selectedRole.is_system ? 'bg-accent text-white border border-transparent' : 'bg-white border border-[rgba(0,0,0,0.06)] text-text-secondary hover:border-text'"
                      :style="selectedRole.is_system ? 'opacity: 0.5; pointer-events: none;' : ''"
                      @click="!selectedRole.is_system && togglePerm(perm.key)"
                    >
                      {{ perm.name }}
                    </div>
                  </div>
                  <div v-else class="text-xs text-text-tertiary py-6 text-center">该菜单无操作权限</div>
                </div>
                <div v-else class="border border-[rgba(0,0,0,0.06)] rounded-lg p-3 min-h-[100px]">
                  <div class="text-xs text-text-tertiary py-6 text-center">请从左侧选择一个菜单</div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="saveEditRole"
              :disabled="saving || selectedRole.name === 'admin'"
              class="px-6 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-all"
            >
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认弹框 -->
    <AppDialog
      :open="!!deletingRole"
      :title="'确认删除角色'"
      :message="`确定删除角色「${deletingRole?.name || ''}」吗？该角色被用户引用时将无法删除，请先移除相关角色关联。`"
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
import { Plus, Trash2 } from 'lucide-vue-next'
import { API_BASE } from '../../lib/apiBase'
import AppDialog from '../../components/AppDialog.vue'
import { loadPermissions, can } from '../../composables/usePermissions.js'

const router = useRouter()
const getToken = () => localStorage.getItem('admin_token')

const roles = ref([])
const allPermissions = ref([])  // { id, module, action, key, name }
const loading = ref(false)
const selectedRole = ref(null)
const isCreating = ref(false)
const formName = ref('')
const formDesc = ref('')
const selectedPerms = ref(new Set())
const inheritFrom = ref('custom')
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

// 角色分组
const builtInRoles = computed(() => roles.value.filter(r => r.is_system))
const customRoles = computed(() => roles.value.filter(r => !r.is_system))

// 角色类型判定:有 menu:admin-* 权限或 name==='admin'→后台角色,否则用户侧角色
const isAdminRole = computed(() => {
  if (isCreating.value) return inheritFrom.value === 'admin'
  if (!selectedRole.value) return false
  if (selectedRole.value.name === 'admin') return true
  return (selectedRole.value.permissions || []).some(k => k.startsWith('menu:admin-'))
})

// 后台/用户侧操作权限 key 清单
const ADMIN_OP_KEYS = new Set([
  'model:sync', 'skill:edit', 'skill:delete', 'mcp:sync',
  'user:view', 'user:create', 'user:edit', 'user:delete',
  'role:view', 'role:create', 'role:edit', 'role:delete',
  'group:view', 'group:create', 'group:edit', 'group:delete',
  'system:config',
])
const PORTAL_OP_KEYS = new Set([
  'model:view', 'key:view', 'key:create', 'key:edit', 'key:delete',
  'skill:view', 'skill:create', 'mcp:view',
])

// 菜单→该菜单下操作权限映射
const MENU_TO_OPS = {
  'menu:admin-stats': ['user:view'],
  'menu:admin-review': ['skill:edit', 'skill:delete'],
  'menu:admin-models': ['model:view', 'model:sync'],
  'menu:admin-skills': ['skill:view', 'skill:create', 'skill:edit', 'skill:delete'],
  'menu:admin-mcps': ['mcp:view', 'mcp:sync'],
  'menu:admin-groups': ['group:view', 'group:create', 'group:edit', 'group:delete'],
  'menu:admin-assignments': ['group:view'],
  'menu:admin-users': ['user:view', 'user:create', 'user:edit', 'user:delete'],
  'menu:admin-roles': ['role:view', 'role:create', 'role:edit', 'role:delete'],
  'menu:admin-config': ['system:config'],
  'menu:admin-oauth': ['system:config'],
  'menu:admin-panel': ['group:view'],
  'menu:models': ['model:view'],
  'menu:skills': ['skill:view', 'skill:create'],
  'menu:mcp': ['mcp:view'],
  'menu:docs': [],
  'menu:profile': [],
  'menu:api-keys': ['key:view', 'key:create', 'key:edit', 'key:delete'],
  'menu:my-skills': ['skill:view', 'skill:create'],
  'menu:submit': ['skill:create'],
}

// 菜单展示顺序
const MENU_ORDER = [
  'menu:admin-stats', 'menu:admin-review',
  'menu:admin-models', 'menu:admin-skills', 'menu:admin-mcps',
  'menu:admin-groups', 'menu:admin-assignments',
  'menu:admin-users', 'menu:admin-roles',
  'menu:admin-config', 'menu:admin-oauth', 'menu:admin-panel',
  'menu:models', 'menu:skills', 'menu:mcp', 'menu:docs',
  'menu:profile', 'menu:api-keys', 'menu:my-skills', 'menu:submit',
]

// 当前选中的菜单项 key（用于右侧显示操作权限）
const selectedMenuKey = ref(null)

// 菜单权限分组（按后台/用户侧两组）
const menuPermissionGroups = computed(() => {
  const backend = { id: 'admin', label: '后台菜单', permissions: [] }
  const portal = { id: 'portal', label: '用户侧菜单', permissions: [] }
  for (const p of allPermissions.value) {
    if (p.module !== 'menu') continue
    if (p.action.startsWith('admin-')) backend.permissions.push(p)
    else portal.permissions.push(p)
  }
  return [backend, portal].filter(g => g.permissions.length)
})

// 操作权限按 module 分组, 按角色类型过滤后台/用户侧
// 按角色类型只显示对应的菜单组
const visibleMenuGroups = computed(() => {
  const target = isAdminRole.value ? 'admin' : 'portal'
  return menuPermissionGroups.value.filter(g => g.id === target)
})

// 按顺序排列的当前角色菜单列表（flat，用于左栏渲染）
const orderedMenuList = computed(() => {
  const keys = new Set()
  for (const g of visibleMenuGroups.value) {
    for (const p of g.permissions) keys.add(p.key)
  }
  // 按 MENU_ORDER 排序，不在排序列表中的排在最后
  const ordered = MENU_ORDER.filter(k => keys.has(k))
  const remaining = [...keys].filter(k => !MENU_ORDER.includes(k))
  return [...ordered, ...remaining].map(key => {
    const perm = allPermissions.value.find(p => p.key === key)
    return perm || { key, name: key, module: 'menu', action: key.replace('menu:', '') }
  })
})

// 菜单全选/全不选
const allMenusSelected = computed(() => {
  return orderedMenuList.value.length > 0 && orderedMenuList.value.every(m => selectedPerms.value.has(m.key))
})
function toggleAllMenus() {
  const newSet = new Set(selectedPerms.value)
  for (const m of orderedMenuList.value) {
    if (allMenusSelected.value) newSet.delete(m.key)
    else newSet.add(m.key)
  }
  selectedPerms.value = newSet
}

// 当前选中菜单的操作权限列表
const selectedMenuOps = computed(() => {
  if (!selectedMenuKey.value) return []
  const opKeys = MENU_TO_OPS[selectedMenuKey.value] || []
  return allPermissions.value.filter(p => opKeys.includes(p.key))
})

function displayName(role) {
  if (role.name === 'admin') return '超级管理员'
  if (role.name === 'user') return '普通用户'
  return role.name
}

function togglePerm(key) {
  const newSet = new Set(selectedPerms.value)
  if (newSet.has(key)) newSet.delete(key)
  else newSet.add(key)
  selectedPerms.value = newSet
}

function applyInherit() {
  const newSet = new Set()
  for (const p of allPermissions.value) {
    if (inheritFrom.value === 'admin') {
      // 后台角色: 后台菜单 + 后台操作
      if (p.module === 'menu' && p.action.startsWith('admin-')) newSet.add(p.key)
      if (p.module !== 'menu' && ADMIN_OP_KEYS.has(p.key)) newSet.add(p.key)
    } else if (inheritFrom.value === 'user') {
      // 用户侧角色: 用户侧菜单 + 用户侧操作
      if (p.module === 'menu' && !p.action.startsWith('admin-')) newSet.add(p.key)
      if (p.module !== 'menu' && PORTAL_OP_KEYS.has(p.key)) newSet.add(p.key)
    }
    // 'custom': 保持为空，从零开始
  }
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
    // 保持选中状态
    if (selectedRole.value) {
      const updated = roles.value.find(r => r.id === selectedRole.value.id)
      if (updated) selectedRole.value = updated
      else selectedRole.value = null
    }
    // 默认选中第一个自定义角色
    if (!selectedRole.value && !isCreating.value) {
      const firstCustom = customRoles.value[0]
      if (firstCustom) selectRole(firstCustom)
    }
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

function selectRole(role) {
  if (isCreating.value) return
  selectedRole.value = role
  formDesc.value = role.description || ''
  selectedPerms.value = new Set(role.permissions || [])
  // 默认选中第一个菜单
  selectedMenuKey.value = orderedMenuList.value[0]?.key || null
}

function startNewRole() {
  isCreating.value = true
  selectedRole.value = null
  formName.value = ''
  formDesc.value = ''
  inheritFrom.value = 'custom'
  selectedPerms.value = new Set()
  selectedMenuKey.value = null
}

function cancelNewRole() {
  isCreating.value = false
  // 恢复选中之前选中的角色
  if (roles.value.length) {
    const firstCustom = customRoles.value[0]
    if (firstCustom) selectRole(firstCustom)
  }
}

async function saveNewRole() {
  if (!formName.value.trim()) return
  saving.value = true
  try {
    const keys = [...selectedPerms.value]
    const res = await fetch(`${API_BASE}/admin/roles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName.value, description: formDesc.value, keys }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '新建角色失败')
    }
    const data = await res.json()
    showToast('角色已创建', 'success')
    isCreating.value = false
    await fetchRoles()
    // 选中新创建的角色
    if (data.data && data.data.id) {
      const created = roles.value.find(r => r.id === data.data.id)
      if (created) selectRole(created)
    }
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function saveEditRole() {
  if (!selectedRole.value) return
  saving.value = true
  try {
    const id = selectedRole.value.id
    const isSystem = selectedRole.value.is_system
    const keys = [...selectedPerms.value]

    // 更新基本信息（描述）
    const body = { description: formDesc.value }
    const baseRes = await fetch(`${API_BASE}/admin/roles/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!baseRes.ok) {
      const err = await baseRes.json().catch(() => ({}))
      throw new Error(err.error || '更新角色失败')
    }
    // 更新权限集（内置角色跳过——后端也会拒）
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
    const deletedId = deletingRole.value.id
    deletingRole.value = null
    showToast('角色已删除', 'success')
    await fetchRoles()
    // 如果删除的是当前选中的角色，清空选中
    if (selectedRole.value?.id === deletedId) {
      selectedRole.value = null
    }
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