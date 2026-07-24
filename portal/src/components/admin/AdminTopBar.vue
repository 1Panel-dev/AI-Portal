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
          @click="logout"
          class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          退出登录
        </button>
      </div>
    </div>
  </header>
  <!-- 点击外部关闭下拉 -->
  <div v-if="showDropdown" class="fixed inset-0 z-[250]" @click="showDropdown = false"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'

const router = useRouter()
const showDropdown = ref(false)

const userInitial = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return (user.name || user.username || 'A').charAt(0).toUpperCase()
  } catch {
    return 'A'
  }
})

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
