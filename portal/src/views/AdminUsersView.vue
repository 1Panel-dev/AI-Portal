<template>
  <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">用户管理</h1>
          <p class="text-text-secondary text-sm mt-1">查看门户用户，删除时会先清理 1Panel 远端用户与 API Key</p>
        </div>
        <div class="flex items-center gap-3">
          <button @click="refreshUsers" :disabled="loading" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary transition-all disabled:opacity-50"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />{{ loading ? '加载中...' : '刷新' }}</button>
          <button v-if="can('user:edit')" @click="syncUsers" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary transition-all disabled:opacity-50"><RefreshCw class="w-4 h-4" />{{ syncing ? '同步中...' : '同步用户' }}</button>
          <button v-if="selectedUsers.size > 0 && can('user:batch-password')" @click="openBatchPassword" class="px-4 py-2 text-sm btn-primary transition-all">{{ `批量改密 (${selectedUsers.size})` }}</button>
          <button v-if="can('user:create')" @click="showNewUserDialog = true" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm btn-primary transition-all"><UserPlus class="w-4 h-4" />新增用户</button>
        </div>
      </div>

      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3">
        <input v-model="keyword" class="flex-1 px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary" placeholder="搜索用户名或姓名..." />
        <button @click="fetchUsers(1)" class="px-4 py-2 text-sm font-medium btn-primary transition-all">搜索</button>
      </div>

      <div v-if="loading && users.length === 0" class="py-20 text-center text-text-secondary">加载中...</div>
      <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card relative">
        <div v-if="loading" class="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
          <span class="text-sm text-text-secondary">刷新中...</span>
        </div>
        <div class="grid grid-cols-[36px_1.2fr_1fr_0.8fr_0.8fr_0.8fr_120px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
          <div class="flex items-center">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" class="h-4 w-4 accent-accent cursor-pointer" />
          </div>
          <div>用户</div><div>角色/状态</div><div>API Key</div><div>提交数</div><div @click="toggleSort" class="cursor-pointer select-none flex items-center gap-1 hover:text-text transition-colors">创建时间 <component :is="sortOrder === 'desc' ? ChevronDown : ChevronUp" class="w-3 h-3" /></div><div class="text-right">操作</div>
        </div>
        <div v-if="users.length === 0" class="py-14 text-center text-sm text-text-secondary">暂无用户</div>
        <div v-for="user in users" :key="user.id" class="grid grid-cols-[36px_1.2fr_1fr_0.8fr_0.8fr_0.8fr_120px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
          <div class="flex items-center">
            <input v-if="user.role !== 'admin' && !user.is_portal_admin" type="checkbox" :checked="selectedUsers.has(user.id)" @change="toggleUser(user.id)" class="h-4 w-4 accent-accent cursor-pointer" />
          </div>
          <div class="min-w-0">
            <div class="font-medium text-text truncate">{{ user.name || user.username }}</div>
            <div class="text-xs text-text-tertiary truncate">{{ user.username }} · Panel ID: {{ user.panel_user_id || '-' }}</div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <template v-if="user.role === 'admin' || user.is_portal_admin">
              <span class="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-600">超级管理员</span>
            </template>
            <template v-else-if="(user.user_roles || []).length">
              <span
                v-for="r in user.user_roles" :key="r.id"
                class="px-2 py-0.5 rounded-full text-xs"
                :class="r.name === 'user' ? 'bg-slate-100 text-slate-600' : 'bg-accent/10 text-accent'"
              >{{ r.name === 'user' ? '普通用户' : r.name }}</span>
            </template>
            <template v-else>
              <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">未分配角色</span>
            </template>
            <span class="px-2 py-0.5 rounded-full text-xs" :class="user.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">{{ user.status }}</span>
          </div>
          <div class="text-text-secondary">{{ user.api_key_count || 0 }}</div>
          <div class="text-text-secondary">{{ user.submission_count || 0 }}</div>
          <div class="text-xs text-text-tertiary">{{ formatDate(user.created_at) }}</div>
          <div class="flex items-center justify-end gap-2">
            <button v-if="user.role !== 'admin' && !user.is_portal_admin && can('user:assign') && can('role:view')" @click="openRoleDialog(user)" class="p-2 text-text-secondary hover:text-accent transition-all" title="分配角色"><UserCog class="w-4 h-4" /></button>
            <button v-if="user.role !== 'admin' && !user.is_portal_admin && can('user:password')" @click="openPasswordDialog(user)" class="p-2 text-text-secondary hover:text-accent transition-all" title="修改密码"><KeyRound class="w-4 h-4" /></button>
            <button v-if="user.role !== 'admin' && !user.is_portal_admin && user.id !== currentUserId && can('user:delete')" @click="confirmDelete(user)" class="p-2 text-text-secondary hover:text-red-500 transition-all" title="删除"><Trash2 class="w-4 h-4" /></button>
            <span v-else class="text-xs text-text-tertiary">不可操作</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between mt-6 text-sm text-text-secondary">
        <span class="text-[13px]">共 {{ total }} 个用户</span>
        <div class="flex items-center gap-1.5">
          <button @click="fetchUsers(1)" :disabled="page <= 1" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">«</button>
          <button @click="fetchUsers(page - 1)" :disabled="page <= 1" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">‹</button>
          <template v-for="p in pageNumbers" :key="p">
            <span v-if="p === '...'" class="px-1 text-text-tertiary">...</span>
            <button v-else @click="fetchUsers(p)" class="w-9 h-9 rounded-lg text-[13px] font-medium transition-all" :class="p === page ? 'bg-accent text-white' : 'border border-[rgba(0,0,0,0.08)] hover:bg-surface-secondary'">{{ p }}</button>
          </template>
          <button @click="fetchUsers(page + 1)" :disabled="page >= totalPages" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">›</button>
          <button @click="fetchUsers(totalPages)" :disabled="page >= totalPages" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">»</button>
        </div>
        <select v-model.number="pageSize" @change="fetchUsers(1)" class="px-2.5 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-lg text-[13px] bg-white outline-none cursor-pointer">
          <option :value="10">10 条/页</option>
          <option :value="20">20 条/页</option>
          <option :value="50">50 条/页</option>
          <option :value="100">100 条/页</option>
        </select>
      </div>
    <Teleport to="body">
      <div v-if="deletingUser" class="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[8px]" @click="deletingUser = null">
        <div class="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-modal" @click.stop>
          <h3 class="text-lg font-semibold text-text mb-2">确认删除用户</h3>
          <p class="text-sm text-text-secondary leading-6 mb-5">确定删除用户「{{ deletingUser.username }}」吗？系统会先删除 1Panel 远端用户和 API Key，成功后再删除本地记录。</p>
          <div class="flex justify-end gap-3">
            <button @click="deletingUser = null" :disabled="deleting" class="px-4 py-2 text-sm btn-secondary disabled:opacity-50">取消</button>
            <button @click="deleteUser" :disabled="deleting" class="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{{ deleting ? '删除中...' : '确认删除' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="passwordUser" class="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[8px]" @click="passwordUser = null">
        <div class="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-modal" @click.stop>
          <h3 class="text-lg font-semibold text-text mb-2">修改密码</h3>
          <p class="text-sm text-text-secondary mb-5">为「{{ passwordUser.username }}」设置新密码，会同步更新到 1Panel 远端。</p>
          <div class="space-y-4 mb-5">
            <div>
              <label class="block text-sm font-medium text-text mb-1.5">新密码</label>
              <div class="relative">
                <input v-model="passwordForm.newPassword" :type="passwordForm.showNew ? 'text' : 'password'" class="w-full px-3 py-2 pr-10 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary" placeholder="至少 6 位" />
                <button type="button" @click="passwordForm.showNew = !passwordForm.showNew" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text"><component :is="passwordForm.showNew ? EyeOff : Eye" class="w-4 h-4" /></button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-text mb-1.5">确认密码</label>
              <div class="relative">
                <input v-model="passwordForm.confirmPassword" :type="passwordForm.showConfirm ? 'text' : 'password'" class="w-full px-3 py-2 pr-10 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary" placeholder="再次输入新密码" />
                <button type="button" @click="passwordForm.showConfirm = !passwordForm.showConfirm" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text"><component :is="passwordForm.showConfirm ? EyeOff : Eye" class="w-4 h-4" /></button>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-3">
            <button @click="closePasswordDialog" :disabled="changingPassword" class="px-4 py-2 text-sm btn-secondary disabled:opacity-50">取消</button>
            <button @click="changePassword" :disabled="changingPassword || !passwordForm.newPassword || passwordForm.newPassword.length < 6 || passwordForm.newPassword !== passwordForm.confirmPassword" class="px-4 py-2 text-sm btn-primary disabled:opacity-50">{{ changingPassword ? '修改中...' : '确认修改' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 角色分配弹框 -->
    <AppDialog :open="showRoleDialog" title="分配角色" size="md" @close="showRoleDialog = false">
      <div class="space-y-2">
        <p class="text-xs text-text-tertiary mb-2">为用户 {{ roleTarget?.username }} 分配角色（单选；admin 为内置超管标记，不可分配）</p>
        <label v-for="r in assignableRoles" :key="r.id" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-secondary cursor-pointer">
          <input type="radio" name="roleRadio" :value="r.id" v-model="selectedRoleId" class="accent-accent" />
          <span class="text-sm text-text">{{ r.name }}</span>
          <span v-if="r.is_system" class="text-[10px] text-text-tertiary">（内置）</span>
        </label>
        <div v-if="!loadingRoles && assignableRoles.length === 0" class="py-4 text-center text-xs text-text-tertiary">暂无可分配角色</div>
      </div>
      <template #footer>
        <button @click="showRoleDialog = false" class="px-4 py-2 text-sm btn-secondary">取消</button>
        <button @click="saveRoles" :disabled="savingRoles" class="px-4 py-2 text-sm btn-primary disabled:opacity-50">{{ savingRoles ? '保存中…' : '保存' }}</button>
      </template>
    </AppDialog>

    <NewUserDialog
      :open="showNewUserDialog"
      :api-base="API_BASE"
      @close="showNewUserDialog = false"
      @created="onUserCreated"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, UserPlus, UserCog, KeyRound, Trash2, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { can } from '../composables/usePermissions.js'
import { showToast } from '../composables/useToast.js'
import NewUserDialog from '../components/admin/NewUserDialog.vue'
import AppDialog from '../components/AppDialog.vue'

import { getLoginToken, parseJwt, errMsg } from '../lib/apiBase'
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()
const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const sortOrder = ref('desc')
const loading = ref(false)

// 搜索防抖: 输入变化后 300ms 自动触发搜索
let searchTimeout = null
watch(keyword, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => fetchUsers(1), 300)
})
const deleting = ref(false)
const deletingUser = ref(null)
const passwordUser = ref(null)
const passwordForm = ref({ newPassword: '', confirmPassword: '', showNew: false, showConfirm: false })
const changingPassword = ref(false)
const syncing = ref(false)
const showNewUserDialog = ref(false)
const onUserCreated = () => { fetchUsers(1) }
const selectedUsers = ref(new Set())
const isBatchPassword = ref(false)
const allSelected = computed(() => {
  const selectable = users.value.filter(u => u.role !== 'admin')
  return selectable.length > 0 && selectable.every(u => selectedUsers.value.has(u.id))
})
const toggleUser = (id) => {
  const s = new Set(selectedUsers.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedUsers.value = s
}
const toggleAll = () => {
  const ids = users.value.filter(u => u.role !== 'admin').map(u => u.id)
  selectedUsers.value = allSelected.value ? new Set() : new Set(ids)
}
const openBatchPassword = () => {
  const first = users.value.find(u => selectedUsers.value.has(u.id))
  passwordUser.value = first
  passwordForm.value = { newPassword: '', confirmPassword: '', showNew: false, showConfirm: false }
  isBatchPassword.value = true
}
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const pageNumbers = computed(() => {
  const tp = totalPages.value
  const p = page.value
  if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1)
  let start = Math.max(1, p - 2)
  let end = Math.min(tp, start + 4)
  start = Math.max(1, end - 4)
  const out = []
  if (start > 1) out.push(1)
  if (start > 2) out.push('...')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < tp - 1) out.push('...')
  if (end < tp) out.push(tp)
  return out
})
const getToken = () => getLoginToken()
// 当前登录用户 id(从 token 解出): 用于隐藏自己那一行的删除按钮(不能删自己)
const currentUserId = computed(() => parseJwt(getToken())?.id)
const toggleSort = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  fetchUsers(1)
}
const formatDate = (v) => v ? new Date(v).toLocaleDateString('zh-CN') : '-'

const fetchUsers = async (nextPage = page.value) => {
  page.value = Math.min(Math.max(1, nextPage), totalPages.value)
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value), sort: sortOrder.value })
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    const res = await fetch(`${API_BASE}/admin/portal-users?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return router.push('/admin/login')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取用户失败'))
    users.value = data.items || []
    total.value = data.total || 0
    page.value = data.page || page.value
    pageSize.value = data.pageSize || pageSize.value
    selectedUsers.value = new Set()
  } catch (err) {
    showToast(err.message || '获取用户失败', 'error')
  } finally {
    loading.value = false
  }
}

const confirmDelete = (user) => { deletingUser.value = user }
const deleteUser = async () => {
  if (!deletingUser.value) return
  deleting.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/portal-users/${deletingUser.value.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '删除失败'))
    deletingUser.value = null
    await fetchUsers(page.value)
  } catch (err) {
    showToast(err.message || '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}
const syncUsers = async () => {
  if (syncing.value) return
  syncing.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/portal-users/sync`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '同步失败'))
    const taskId = data.taskId
    if (!taskId) {
      // 降级：旧接口直接返回结果
      showToast(data.message || '同步完成', 'success')
      await fetchUsers(1)
      return
    }
    showToast('任务已提交，正在后台同步...', 'success')
    // 轮询任务状态
    await pollSyncTask(taskId)
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

const pollSyncTask = async (taskId) => {
  const maxAttempts = 180 // 最多 3 分钟（1s/次）
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const r = await fetch(`${API_BASE}/admin/sync-tasks/${taskId}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!r.ok) continue
      const task = await r.json()
      if (task.status === 'done') {
        const result = typeof task.result === 'object' ? task.result : {}
        showToast(result.message || '同步完成', 'success')
        await fetchUsers(1)
        return
      }
      if (task.status === 'error') {
        showToast(task.message || '同步失败', 'error')
        return
      }
    } catch (e) { /* 网络抖动，继续轮询 */ }
  }
  showToast('同步超时，请刷新页面查看最新数据', 'error')
}

const refreshUsers = () => fetchUsers(page.value)

const openPasswordDialog = (user) => {
  passwordUser.value = user
  passwordForm.value = { newPassword: '', confirmPassword: '', showNew: false, showConfirm: false }
  isBatchPassword.value = false
}
const closePasswordDialog = () => { passwordUser.value = null }

const changePassword = async () => {
  if (!passwordUser.value) return
  changingPassword.value = true
  try {
    const ids = isBatchPassword.value
      ? [...selectedUsers.value]
      : [passwordUser.value.id]
    const res = await fetch(`${API_BASE}/admin/portal-users/password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: ids, new_password: passwordForm.value.newPassword }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '修改失败'))
    closePasswordDialog()
    selectedUsers.value = new Set()
    showToast(`密码已修改，成功 ${data.success || 0} 个`, 'success')
  } catch (err) {
    showToast(err.message || '修改失败', 'error')
  } finally {
    changingPassword.value = false
  }
}

// —— 角色分配 ——
const showRoleDialog = ref(false)
const roleTarget = ref(null)
const assignableRoles = ref([])      // 可分配角色列表（排除 admin 超管标记）
const selectedRoleId = ref(null)
const savingRoles = ref(false)
const loadingRoles = ref(false)

// 打开分配弹框: 拉可分配角色列表 + 该用户已分配角色
const openRoleDialog = async (user) => {
  roleTarget.value = user
  showRoleDialog.value = true
  loadingRoles.value = true
  assignableRoles.value = []
  selectedRoleId.value = null
  try {
    const token = getToken()
    // 拉全部角色, 前端排除 admin（超管标记, 不可分配）
    const [rolesRes, userRolesRes] = await Promise.all([
      fetch(`${API_BASE}/admin/roles`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/admin/users/${user.id}/roles`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
    // 任一拉取失败(权限 403 / 服务器错误)都不能按空列表展示——否则保存会以空 roleIds 全量清空目标用户角色
    if (!rolesRes.ok || !userRolesRes.ok) {
      showRoleDialog.value = false
      showToast('加载角色列表失败,请重试', 'error')
      return
    }
    const rolesData = await rolesRes.json().catch(() => ({}))
    const userRolesData = await userRolesRes.json().catch(() => ({}))
    assignableRoles.value = (rolesData.data || []).filter(r => r.name !== 'admin')
    // 单角色: 取第一个已分配角色的 id
    const userRoles = userRolesData.data || []
    selectedRoleId.value = userRoles.length > 0 ? userRoles[0].id : null
  } catch (e) {
    showToast(e.message || '加载角色失败', 'error')
  } finally {
    loadingRoles.value = false
  }
}

const saveRoles = async () => {
  if (!roleTarget.value) return
  savingRoles.value = true
  try {
    const token = getToken()
    const r = await fetch(`${API_BASE}/admin/users/${roleTarget.value.id}/roles`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: selectedRoleId.value ? [selectedRoleId.value] : [] }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(errMsg(data, '保存失败'))
    showRoleDialog.value = false
    showToast('角色已保存', 'success')
    await fetchUsers(page.value)
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  } finally {
    savingRoles.value = false
  }
}

onMounted(() => fetchUsers(1))
</script>
