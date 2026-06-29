<template>
  <div class="text-center py-6">
    <button
      v-if="hasMore"
      @click="$emit('load-more')"
      class="px-8 py-2.5 rounded-pill border border-[rgba(0,0,0,0.1)] bg-white text-text text-sm font-medium cursor-pointer transition-all hover:bg-surface-secondary hover:border-[rgba(0,0,0,0.15)]"
    >
      加载更多
    </button>
    <span v-else class="text-sm text-text-tertiary">
      已加载全部 {{ total }} 个{{ label }}
    </span>
  </div>
</template>

<script setup>
defineProps({
  hasMore: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  label: { type: String, default: '技能' },
})

defineEmits(['load-more'])
</script>
