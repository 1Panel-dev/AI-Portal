<template>
  <header
    class="flex-shrink-0 h-[52px] flex items-center justify-between px-6 bg-white border-b border-[rgba(0,0,0,0.06)] shadow-[0_1px_10px_rgba(15,23,42,0.04)]"
  >
    <!-- 左：返回门户 -->
    <router-link
      to="/"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-text-secondary rounded-lg transition-colors hover:bg-black/5 hover:text-text no-underline"
    >
      <ArrowLeft class="w-4 h-4" />
      返回门户
    </router-link>

    <!-- 右：管理员头像下拉 -->
    <div class="relative">
      <button
        @click="showDropdown = !showDropdown"
        class="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-text rounded-lg transition-colors hover:bg-black/5"
      >
        <div class="w-6 h-6 bg-text rounded-full flex items-center justify-center">
          <span class="text-[10px] text-white font-medium">{{ userInitial }}</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          class="transition-transform" :class="{ 'rotate-180': showDropdown }">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        v-if="showDropdown"
        class="absolute right-0 top-full mt-2 w-[160px] bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-card-hover py-1 z-[265]"
      >
        <button
          @click="openPasswordDialog"
          class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-text hover:bg-black/5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          修改密码
        </button>
        <div class="my-1 border-t border-[rgba(0,0,0,0.06)]"></div>
        <button
          @click="logout"
          class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          退出登录
        </button>
      </div>
    </div>

    <!-- 修改密码弹框 -->
    <AppDialog :open="showPasswordDialog" title="修改密码" size="sm" @close="closePasswordDialog">
      <div class="space-y-3">
        <div>
          <label class="block text-sm text-text mb-1">当前密码</label>
          <input v-model="oldPassword" type="password" class="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary" placeholder="输入当前密码" />
        </div>
        <div>
          <label class="block text-sm text-text mb-1">新密码</label>
          <input v-model="newPassword" type="password" class="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary" placeholder="至少 6 位" />
        </div>
        <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
      </div>
      <template #footer>
        <button class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary" @click="closePasswordDialog">取消</button>
        <button class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50" :disabled="changing || !oldPassword || !newPassword || newPassword.length < 6" @click="doChangePassword">{{ changing ? '修改中...' : '确认修改' }}</button>
      </template>
    </AppDialog>
  </header>
  <!-- 点击外部关闭下拉 -->
  <div v-if="showDropdown" class="fixed inset-0 z-[250]" @click="showDropdown = false"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { API_BASE, getLoginToken } from '../../lib/apiBase'
import AppDialog from '../AppDialog.vue'

const router = useRouter()
const showDropdown = ref(false)
const showPasswordDialog = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const changing = ref(false)
const error = ref('')

const userInitial = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return (user.name || user.username || 'A').charAt(0).toUpperCase()
  } catch {
    return 'A'
  }
})

function openPasswordDialog() {
  showDropdown.value = false
  oldPassword.value = ''
  newPassword.value = ''
  error.value = ''
  showPasswordDialog.value = true
}
function closePasswordDialog() { showPasswordDialog.value = false }

async function doChangePassword() {
  changing.value = true
  error.value = ''
  try {
    const token = getLoginToken()
    const res = await fetch(`${API_BASE}/auth/password`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword.value }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || '修改失败')
    }
    showPasswordDialog.value = false
    // 简洁 toast 提示成功
    const hint = document.createElement('div')
    hint.className = 'fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg bg-green-600 text-white animate-fade-up'
    hint.textContent = '密码已修改'
    document.body.appendChild(hint)
    setTimeout(() => hint.remove(), 2000)
  } catch (e) {
    error.value = e.message
  } finally {
    changing.value = false
  }
}

const logout = () => {
  showDropdown.value = false
  localStorage.removeItem('token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('user')
  router.push('/login')
}

const handleKeydown = (e) => { if (e.key === 'Escape') showDropdown.value = false }
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>
