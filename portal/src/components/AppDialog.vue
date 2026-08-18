<!-- 统一弹窗:提示/确认/警告,与项目苹果极简纯亮色风格一致 -->
<script setup>
import { useSlots, computed } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  type: { type: String, default: 'info' },   // info | confirm
  cancelText: { type: String, default: '取消' },
  confirmText: { type: String, default: '确定' },
  // 宽度: 默认 400px, 表单类弹框可传 'md'(480) / 'lg'(560)
  size: { type: String, default: 'sm' },
})
const emit = defineEmits(['close', 'confirm'])
const slots = useSlots()
const hasBody = computed(() => !!slots.default)
const widthClass = computed(() => ({ sm: 'w-[400px]', md: 'w-[480px]', lg: 'w-[560px]' }[props.size] || 'w-[400px]'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-[8px] px-5" @click.self="$emit('close')">
      <div class="bg-white rounded-2xl shadow-modal p-6 max-w-[90vw]" :class="widthClass">
        <h3 v-if="title" class="text-lg font-semibold text-text mb-3">{{ title }}</h3>
        <!-- 默认插槽: 支持表单等富内容; 无插槽时回退到 message 纯文本 -->
        <div v-if="hasBody" class="text-sm text-text-secondary leading-relaxed">
          <slot />
        </div>
        <p v-else class="text-sm text-text-secondary leading-relaxed">{{ message }}</p>
        <!-- 默认操作按钮: 仅当未提供 footer 插槽时渲染（footer 插槽用于自定义保存逻辑） -->
        <div v-if="!slots.footer" class="flex justify-end gap-3 mt-6">
          <button v-if="type === 'confirm' || hasBody"
            @click="$emit('close')"
            class="px-4 py-2 text-sm btn-secondary"
          >
            {{ cancelText }}
          </button>
          <button
            @click="type === 'confirm' ? $emit('confirm') : $emit('close')"
            class="px-4 py-2 text-sm btn-primary"
          >
            {{ type === 'confirm' ? confirmText : '知道了' }}
          </button>
        </div>
        <!-- 可选 footer 插槽: 覆盖默认操作按钮 -->
        <div v-else class="flex justify-end gap-3 mt-6">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
