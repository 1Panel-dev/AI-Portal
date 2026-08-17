<script setup>
// 全局 toast 浮层: 挂在 App 根, 消费 useToast 的共享状态。
import { computed } from 'vue'
import { useToast } from '../composables/useToast.js'

const { toast } = useToast()

const typeClass = computed(() => ({
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-[#1D2129] text-white',
}[toast.value.type] || 'bg-[#1D2129] text-white'))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="toast.show"
      class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-fade-up max-w-[80vw] break-words"
      :class="typeClass"
      @click="toast.show = false"
    >
      {{ toast.message }}
    </div>
  </Teleport>
</template>
