<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  apiBase: { type: String, required: true },
})
const emit = defineEmits(['close', 'created'])

const username = ref('')
const name = ref('')
const password = ref('')
const role = ref('user')
const loading = ref(false)
const error = ref('')

watch(() => props.open, (v) => {
  if (v) {
    username.value = ''
    name.value = ''
    password.value = ''
    role.value = 'user'
    error.value = ''
    loading.value = false
  }
})

async function submit() {
  error.value = ''
  if (!username.value.trim() || username.value.length < 3) {
    error.value = '用户名需3-30位字符'
    return
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username.value)) {
    error.value = '用户名只能包含英文、数字和下划线'
    return
  }
  if (!password.value || password.value.length < 6) {
    error.value = '密码至少6位'
    return
  }
  loading.value = true
  try {
    const token = localStorage.getItem('admin_token') || ''
    const res = await fetch(`${props.apiBase}/admin/portal-users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value.trim(),
        name: name.value.trim(),
        password: password.value,
        role: role.value,
      })
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || '创建失败'
      return
    }
    emit('created', data.user)
    emit('close')
  } catch (err) {
    error.value = err.message || '创建失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="$emit('close')">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-[420px] max-w-[90vw]">
      <h3 class="text-lg font-semibold text-text mb-4">新增用户</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-text-secondary mb-1">用户名 <span class="text-red-500">*</span></label>
          <input v-model="username" type="text" placeholder="3-30 位英文、数字、下划线"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text" />
        </div>
        <div>
          <label class="block text-sm text-text-secondary mb-1">显示名</label>
          <input v-model="name" type="text" placeholder="留空则使用用户名"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text" />
        </div>
        <div>
          <label class="block text-sm text-text-secondary mb-1">初始密码 <span class="text-red-500">*</span></label>
          <input v-model="password" type="password" placeholder="至少 6 位"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text" />
        </div>
        <div>
          <label class="block text-sm text-text-secondary mb-1">角色</label>
          <select v-model="role"
            class="w-full px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text bg-white">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button @click="$emit('close')" :disabled="loading"
          class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary disabled:opacity-50">
          取消
        </button>
        <button @click="submit" :disabled="loading"
          class="px-4 py-2 text-sm bg-text text-white rounded-lg hover:opacity-80 disabled:opacity-50">
          {{ loading ? '创建中...' : '确认创建' }}
        </button>
      </div>
    </div>
  </div>
</template>
