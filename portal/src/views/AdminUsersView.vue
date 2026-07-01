<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[1000px] mx-auto px-6 py-10 pt-[132px]">
      <div class="flex items-center gap-4 mb-6">
        <button @click="$router.push('/admin')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">审核管理</button>
        <button @click="$router.push('/admin/skills')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/skills' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">技能管理</button>
        <button @click="$router.push('/admin/users')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/users' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">用户管理</button>
        <button @click="$router.push('/admin/config')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/config' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">系统配置</button>
        <button @click="$router.push('/admin/oauth')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/oauth' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">第三方登录</button>
      </div>

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">用户管理</h1>
          <p class="text-text-secondary text-sm mt-1">查看门户用户，删除时会先清理 1Panel 远端用户与 API Key</p>
        </div>
        <div class="flex items-center gap-3">
          <button @click="syncUsers" :disabled="syncing" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50"><RefreshCw class="w-4 h-4" />{{ syncing ? '同步中...' : '同步用户' }}</button>
          <button v-if="selectedUsers.size > 0" @click="openBatchPassword" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all">{{ `批量改密 (${selectedUsers.size})` }}</button>
          <button @click="showNewUserDialog = true" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all"><UserPlus class="w-4 h-4" />新增用户</button>
          <button @click="logout" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all">退出登录</button>
        </div>
      </div>

      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3">
        <input v-model="keyword" @keyup.enter="fetchUsers(1)" class="flex-1 px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary" placeholder="搜索用户名或姓名..." />
        <button @click="fetchUsers(1)" class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-all">搜索</button>
      </div>

      <div v-if="loading" class="py-20 text-center text-text-secondary">加载中...</div>
      <div v-else class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
        <div class="grid grid-cols-[36px_1.2fr_1fr_0.8fr_0.8fr_0.8fr_120px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
          <div class="flex items-center">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" class="h-4 w-4 accent-text cursor-pointer" />
          </div>
          <div>用户</div><div>角色/状态</div><div>API Key</div><div>提交数</div><div @click="toggleSort" class="cursor-pointer select-none flex items-center gap-1 hover:text-text transition-colors">创建时间 <component :is="sortOrder === 'desc' ? ChevronDown : ChevronUp" class="w-3 h-3" /></div><div class="text-right">操作</div>
        </div>
        <div v-if="users.length === 0" class="py-14 text-center text-sm text-text-secondary">暂无用户</div>
        <div v-for="user in users" :key="user.id" class="grid grid-cols-[36px_1.2fr_1fr_0.8fr_0.8fr_0.8fr_120px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
          <div class="flex items-center">
            <input v-if="user.role !== 'admin'" type="checkbox" :checked="selectedUsers.has(user.id)" @change="toggleUser(user.id)" class="h-4 w-4 accent-text cursor-pointer" />
          </div>
          <div class="min-w-0">
            <div class="font-medium text-text truncate">{{ user.name || user.username }}</div>
            <div class="text-xs text-text-tertiary truncate">{{ user.username }} · Panel ID: {{ user.panel_user_id || '-' }}</div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-xs" :class="user.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</span>
            <span class="px-2 py-0.5 rounded-full text-xs" :class="user.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">{{ user.status }}</span>
          </div>
          <div class="text-text-secondary">{{ user.api_key_count || 0 }}</div>
          <div class="text-text-secondary">{{ user.submission_count || 0 }}</div>
          <div class="text-xs text-text-tertiary">{{ formatDate(user.created_at) }}</div>
          <div class="text-right flex items-center justify-end gap-1.5">
            <button v-if="user.role !== 'admin'" @click="openPasswordDialog(user)" class="px-2.5 py-1 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-all">改密</button>
            <button v-if="user.role !== 'admin'" @click="confirmDelete(user)" class="px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-all">删除</button>
            <span v-else class="text-xs text-text-tertiary">不可操作</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between mt-4 text-sm text-text-secondary">
        <div>共 {{ total }} 个用户</div>
        <div class="flex items-center gap-2">
          <button @click="fetchUsers(page - 1)" :disabled="page <= 1" class="px-3 py-1.5 border border-[rgba(0,0,0,0.08)] rounded-lg disabled:opacity-40 hover:bg-surface-secondary">上一页</button>
          <span>第 {{ page }} / {{ totalPages }} 页</span>
          <button @click="fetchUsers(page + 1)" :disabled="page >= totalPages" class="px-3 py-1.5 border border-[rgba(0,0,0,0.08)] rounded-lg disabled:opacity-40 hover:bg-surface-secondary">下一页</button>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <div v-if="deletingUser" class="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[8px]" @click="deletingUser = null">
        <div class="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-modal" @click.stop>
          <h3 class="text-lg font-semibold text-text mb-2">确认删除用户</h3>
          <p class="text-sm text-text-secondary leading-6 mb-5">确定删除用户「{{ deletingUser.username }}」吗？系统会先删除 1Panel 远端用户和 API Key，成功后再删除本地记录。</p>
          <div class="flex justify-end gap-3">
            <button @click="deletingUser = null" :disabled="deleting" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary disabled:opacity-50">取消</button>
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
            <button @click="closePasswordDialog" :disabled="changingPassword" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary disabled:opacity-50">取消</button>
            <button @click="changePassword" :disabled="changingPassword || !passwordForm.newPassword || passwordForm.newPassword.length < 6 || passwordForm.newPassword !== passwordForm.confirmPassword" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">{{ changingPassword ? '修改中...' : '确认修改' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast 通知 -->
    <Teleport to="body">
      <div v-if="toast.show" class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-fade-up" :class="toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'" @click="toast.show = false">
        {{ toast.message }}
      </div>
    </Teleport>

    <NewUserDialog
      :open="showNewUserDialog"
      :api-base="API_BASE"
      @close="showNewUserDialog = false"
      @created="onUserCreated"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, UserPlus, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-vue-next'
import NavBar from '../components/NavBar.vue'
import NewUserDialog from '../components/admin/NewUserDialog.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()
const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const sortOrder = ref('desc')
const loading = ref(false)
const deleting = ref(false)
const deletingUser = ref(null)
const passwordUser = ref(null)
const passwordForm = ref({ newPassword: '', confirmPassword: '', showNew: false, showConfirm: false })
const changingPassword = ref(false)
const syncing = ref(false)
const showNewUserDialog = ref(false)
const onUserCreated = () => { fetchUsers(1) }
const selectedUsers = ref(new Set())
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
}
const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null

const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const getToken = () => localStorage.getItem('admin_token')
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
    if (!res.ok) throw new Error(data.error || '获取用户失败')
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
    if (!res.ok) throw new Error(data.reason || data.error || '删除失败')
    deletingUser.value = null
    await fetchUsers(page.value)
  } catch (err) {
    showToast(err.message || '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}
const syncUsers = async () => {
  syncing.value = true
  try {
    const res = await fetch(`${API_BASE}/admin/portal-users/sync`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.reason || '同步失败')
    showToast(data.message || `同步完成，新增 ${data.synced || 0} 个用户`, 'success')
    await fetchUsers(1)
  } catch (err) {
    showToast(err.message || '同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

const openPasswordDialog = (user) => {
  passwordUser.value = user
  passwordForm.value = { newPassword: '', confirmPassword: '', showNew: false, showConfirm: false }
}
const closePasswordDialog = () => { passwordUser.value = null }

const changePassword = async () => {
  if (!passwordUser.value) return
  changingPassword.value = true
  try {
    const ids = selectedUsers.value.size > 1
      ? [...selectedUsers.value]
      : [passwordUser.value.id]
    const res = await fetch(`${API_BASE}/admin/portal-users/password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: ids, new_password: passwordForm.value.newPassword }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.reason || data.error || '修改失败')
    closePasswordDialog()
    selectedUsers.value = new Set()
    showToast(`密码已修改，成功 ${data.success || 0} 个`, 'success')
  } catch (err) {
    showToast(err.message || '修改失败', 'error')
  } finally {
    changingPassword.value = false
  }
}

const logout = () => { localStorage.removeItem('admin_token'); localStorage.removeItem('user'); router.push('/admin/login') }

onMounted(() => fetchUsers(1))
</script>
