<template>
  <div
    class="bg-white rounded-card border border-[rgba(0,0,0,0.04)] p-6 cursor-pointer transition-all duration-300 ease-out flex flex-col hover:-translate-y-0.5 hover:border-[rgba(91,95,199,0.22)] hover:shadow-[0_16px_40px_rgba(91,95,199,0.10)]"
    :style="{ animationDelay: `${0.05 + index * 0.05}s` }"
    @click="$emit('click')"
  >
    <!-- Header: Icon + Name + Type -->
    <div class="flex items-start gap-3.5 mb-3">
      <div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-base font-bold shrink-0 bg-[#eef2ff] text-[#5b5fc7]">
        {{ initial }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <div class="text-[15px] font-semibold text-text leading-tight truncate">{{ server.name }}</div>
          <span
            class="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 rounded border border-purple-200"
          >{{ server.type }}</span>
        </div>
        <div class="text-[11px] text-text-tertiary mt-0.5">{{ relativeTime(server.updatedAt) }}</div>
      </div>
    </div>

    <!-- Status + Port -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-1.5">
        <span
          class="inline-block w-2 h-2 rounded-full"
          :class="server.status === 'Running' ? 'bg-green-500' : 'bg-gray-400'"
        ></span>
        <span
          class="text-[12px] font-medium"
          :class="server.status === 'Running' ? 'text-green-700' : 'text-gray-500'"
        >{{ server.status || 'Unknown' }}</span>
      </div>
      <span class="text-[11px] font-mono text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded">
        :{{ server.port }}
      </span>
    </div>

    <!-- SSE URL -->
    <div class="flex items-center gap-2 mb-3">
      <div class="flex-1 min-w-0 bg-surface-secondary rounded-lg px-3 py-2.5 font-mono text-[11px] text-text-secondary truncate">
        {{ sseUrl }}
      </div>
      <button
        @click.stop="copyConfig"
        class="shrink-0 w-9 h-9 bg-accent text-white border-none rounded-lg cursor-pointer flex items-center justify-center transition-colors duration-150 hover:bg-accent-hover"
        title="复制客户端配置"
      >
        <svg v-if="copied" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between pt-3 border-t border-[rgba(0,0,0,0.04)] mt-auto">
      <span class="text-[11px] font-medium text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded">
        {{ server.outputTransport }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  server: { type: Object, required: true },
  index: { type: Number, default: 0 },
})

defineEmits(['click'])

const copied = ref(false)

const initial = computed(() => {
  const name = props.server.name || ''
  return name.charAt(0).toUpperCase()
})

const sseUrl = computed(() => {
  const baseUrl = (props.server.baseUrl || '').replace(/\/+$/, '')
  const ssePath = props.server.ssePath || ''
  return baseUrl + ssePath
})

const relativeTime = (dateStr) => {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`
  return new Date(dateStr).toLocaleDateString()
}

const copyConfig = async () => {
  const config = {
    mcpServers: {
      [props.server.name]: { url: sseUrl.value },
    },
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2))
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>
