<!-- 统一弹窗:提示/确认/警告,与项目苹果极简纯亮色风格一致 -->
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  type: { type: String, default: 'info' },   // info | confirm
  cancelText: { type: String, default: '取消' },
  confirmText: { type: String, default: '确定' },
})
const emit = defineEmits(['close', 'confirm'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[200] flex items-center justify-center" @click.self="$emit('close')">
      <div class="bg-white rounded-2xl shadow-modal p-6 w-[400px] max-w-[90vw]">
        <h3 v-if="title" class="text-lg font-semibold text-text mb-3">{{ title }}</h3>
        <p class="text-sm text-text-secondary leading-relaxed">{{ message }}</p>
        <div class="flex justify-end gap-3 mt-6">
          <button v-if="type === 'confirm'"
            @click="$emit('close')"
            class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary"
          >
            {{ cancelText }}
          </button>
          <button
            @click="type === 'confirm' ? $emit('confirm') : $emit('close')"
            class="px-4 py-2 text-sm bg-text text-white rounded-lg hover:opacity-80"
          >
            {{ type === 'confirm' ? confirmText : '知道了' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
