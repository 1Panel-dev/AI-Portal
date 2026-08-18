<!-- 通用分页控件: 只在 totalPages > 1 时渲染; 外层 spacing 由父组件通过 class 透传控制 -->
<template>
  <div v-if="totalPages > 1" class="flex items-center justify-between text-sm text-text-secondary">
    <span class="text-[13px]">共 {{ total }} {{ label }}</span>
    <div class="flex items-center gap-2">
      <button
        @click="emit('change', page - 1)"
        :disabled="page <= 1"
        class="w-8 h-8 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]"
      >‹</button>
      <span class="text-[13px]">{{ page }} / {{ totalPages }}</span>
      <button
        @click="emit('change', page + 1)"
        :disabled="page >= totalPages"
        class="w-8 h-8 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]"
      >›</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, default: 0 },
  label: { type: String, default: '条' },
})

const emit = defineEmits(['change'])
</script>
