<!-- 通用分页控件: 只在 totalPages > 1 时渲染; 外层 spacing 由父组件通过 class 透传控制。
     showFirstLast=true 时显示 « 首页 / » 末页; 传 pageSize 时显示「每页条数」下拉。 -->
<template>
  <div v-if="totalPages > 1" class="flex items-center justify-between text-sm text-text-secondary">
    <span class="text-[13px]">共 {{ total }} {{ label }}</span>
    <div class="flex items-center gap-2">
      <button
        v-if="showFirstLast"
        @click="emit('change', 1)"
        :disabled="page <= 1"
        class="w-8 h-8 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium"
      >«</button>
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
      <button
        v-if="showFirstLast"
        @click="emit('change', totalPages)"
        :disabled="page >= totalPages"
        class="w-8 h-8 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium"
      >»</button>
    </div>
    <select
      v-if="pageSize != null"
      :value="pageSize"
      @change="onPageSizeChange"
      class="px-2.5 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-lg text-[13px] bg-white outline-none cursor-pointer"
    >
      <option v-for="s in pageSizeOptions" :key="s" :value="s">{{ s }} 条/页</option>
    </select>
  </div>
</template>

<script setup>
defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, default: 0 },
  label: { type: String, default: '条' },
  showFirstLast: { type: Boolean, default: false },
  pageSize: { type: Number, default: null },
  pageSizeOptions: { type: Array, default: () => [10, 20, 50] },
})

const emit = defineEmits(['change', 'page-size-change'])

function onPageSizeChange(e) {
  const size = Number(e.target.value)
  emit('page-size-change', size)
  emit('change', 1)
}
</script>
