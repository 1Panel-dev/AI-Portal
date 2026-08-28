<!-- 统一右侧抽屉:点击卡片查看详情等场景,与项目苹果极简纯亮色风格一致 -->
<script setup>
import { useSlots, computed } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  // 宽度: 默认 460px, 调用示例类可传 'lg'(560) / 'xl'(640)
  width: { type: String, default: 'md' },
})
const emit = defineEmits(['close'])
const slots = useSlots()
const widthClass = computed(() => ({ sm: 'w-[400px]', md: 'w-[480px]', lg: 'w-[560px]', xl: 'w-[640px]', full: 'w-[min(600px,50vw)]' }[props.width] || 'w-[480px]'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[300] flex justify-end">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[4px]" @click="$emit('close')" />
      <!-- 抽屉本体 -->
      <div class="relative h-full bg-white shadow-modal animate-drawer-in" :class="widthClass">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-5 border-b border-[rgba(0,0,0,0.06)]">
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="text-lg font-semibold text-text truncate">{{ title }}</h3>
            <slot name="title-extra" />
          </div>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:bg-surface-secondary hover:text-text transition-all shrink-0" @click="$emit('close')" title="关闭">
            <X class="w-4 h-4" />
          </button>
        </div>
        <!-- 内容 -->
        <div class="px-6 py-5 overflow-y-auto h-[calc(100%-65px)]">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.animate-drawer-in {
  animation: drawerIn 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes drawerIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>