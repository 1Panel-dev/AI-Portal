<template>
  <div class="relative">
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value)"
      class="appearance-none pl-3 pr-7 py-1.5 text-[13px] cursor-pointer outline-none rounded-lg border bg-white transition-all duration-150"
      :class="isActive
        ? 'border-text text-text font-semibold hover:bg-black/[0.02] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]'
        : 'border-[rgba(0,0,0,0.1)] text-text font-medium hover:border-text hover:bg-black/[0.02] focus:border-text focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]'"
      :aria-label="label"
    >
      <option v-for="opt in options" :key="opt.id" :value="opt.id">
        {{ label }}: {{ opt.name }}
      </option>
    </select>
    <!-- 下拉箭头: 激活时颜色加深表明"已筛选" -->
    <svg
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
      :class="isActive ? 'text-text' : 'text-text-tertiary'"
      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true }, // [{id, name}]
  modelValue: { type: String, required: true },
})

defineEmits(['update:modelValue'])

// 当前值非默认值(非 'all' 也非 'default')时,视为"已激活筛选"
// 仅做轻微视觉提示: 边框变深 + 字体加粗 + 箭头变深, 不改背景色避免视觉冲击
const isActive = computed(() => {
  return props.modelValue && props.modelValue !== 'all' && props.modelValue !== 'default'
})
</script>
