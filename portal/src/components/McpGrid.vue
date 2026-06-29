<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
    <McpCard
      v-for="(server, index) in servers"
      :key="server.id"
      :server="server"
      :index="index"
      class="animate-fade-up"
      :style="{ animationDelay: `${Math.min(index, 8) * 0.05}s` }"
      @click="$emit('select', server)"
    />
  </div>

  <!-- Empty state -->
  <div
    v-if="servers.length === 0 && !loading"
    class="text-center py-16 text-text-secondary text-[15px]"
  >
    {{ noResultsText }}
  </div>

  <!-- Loading skeleton -->
  <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
    <div
      v-for="i in 8"
      :key="i"
      class="bg-white rounded-card border border-[rgba(0,0,0,0.04)] overflow-hidden animate-pulse"
    >
      <div class="p-5 space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-surface-secondary rounded-icon"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 bg-surface-secondary rounded w-3/4"></div>
            <div class="h-3 bg-surface-secondary rounded w-1/2"></div>
          </div>
        </div>
        <div class="flex gap-2">
          <div class="h-3 bg-surface-secondary rounded w-16"></div>
          <div class="h-3 bg-surface-secondary rounded w-12 ml-auto"></div>
        </div>
        <div class="h-8 bg-surface-secondary rounded w-full"></div>
        <div class="h-3 bg-surface-secondary rounded w-1/3"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import McpCard from './McpCard.vue'

const props = defineProps({
  servers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
})

defineEmits(['select'])

const noResultsText = computed(() => {
  if (props.searchQuery) {
    return `未找到与"${props.searchQuery}"匹配的 MCP 服务`
  }
  return '暂无 MCP 服务'
})
</script>
