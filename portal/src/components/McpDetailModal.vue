<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-[8px] z-[200] flex items-center justify-center p-5"
      @click="closeOnOverlay"
    >
      <div
        class="bg-white rounded-modal w-full max-w-[640px] max-h-[85vh] overflow-hidden shadow-modal relative animate-modal-in"
        @click.stop
      >
        <!-- Close button -->
        <button
          @click="close"
          class="absolute top-5 right-5 w-8 h-8 rounded-full border-none bg-surface-secondary text-text-secondary cursor-pointer flex items-center justify-center transition-colors hover:bg-[#e8e8ed] z-10 text-base"
        >
          ✕
        </button>

        <!-- Header -->
        <div class="p-8 pb-0 flex items-start gap-4">
          <div class="w-14 h-14 rounded-[14px] flex items-center justify-center text-2xl font-bold shrink-0 bg-[#eef2ff] text-[#5b5fc7]">
            {{ initial }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-[22px] font-bold text-text tracking-[-0.3px]">{{ server.name }}</h2>
              <span class="shrink-0 px-2 py-0.5 text-[11px] font-medium bg-purple-50 text-purple-700 rounded border border-purple-200">{{ server.type }}</span>
            </div>
            <div class="flex items-center gap-2 mt-1.5">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="server.status === 'Running' ? 'bg-green-500' : 'bg-gray-400'"
              ></span>
              <span class="text-[13px]" :class="server.status === 'Running' ? 'text-green-700 font-medium' : 'text-gray-500'">
                {{ server.status || 'Unknown' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="p-8 overflow-y-auto max-h-[calc(85vh-100px)]">
          <!-- MCP Client Config -->
          <div class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              客户端配置
            </h3>
            <p class="text-xs text-text-secondary mb-2.5">复制以下 JSON 配置到 Cursor / Claude Desktop / Windsurf 等 MCP 客户端</p>
            <div class="relative group">
              <pre class="text-xs font-mono text-text whitespace-pre-wrap leading-relaxed bg-surface-secondary rounded-xl p-4 pr-14 border border-[rgba(0,0,0,0.04)]">{{ mcpConfigJson }}</pre>
              <button
                @click="copyText(mcpConfigJson)"
                class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white text-text-secondary text-xs cursor-pointer transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-secondary hover:text-text"
                :class="{ 'opacity-100': copied }"
              >
                {{ copied ? '✓ 已复制' : '复制' }}
              </button>
            </div>
          </div>

          <!-- 连接参数 -->
          <div class="space-y-2 text-sm bg-surface-secondary rounded-2xl p-5">
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">SSE URL</span>
              <span class="text-text font-mono text-xs break-all text-right max-w-[70%]">{{ sseUrl }}</span>
            </div>
            <div v-if="server.baseUrl" class="flex items-center justify-between pt-2 border-t border-[rgba(0,0,0,0.04)]">
              <span class="text-text-secondary">Base URL</span>
              <span class="text-text font-mono text-xs">{{ server.baseUrl }}</span>
            </div>
            <div v-if="server.ssePath" class="flex items-center justify-between">
              <span class="text-text-secondary">SSE Path</span>
              <span class="text-text font-mono text-xs">{{ server.ssePath }}</span>
            </div>
            <div v-if="server.port" class="flex items-center justify-between">
              <span class="text-text-secondary">端口</span>
              <span class="text-text font-mono text-xs">{{ server.port }}</span>
            </div>
            <div v-if="server.outputTransport" class="flex items-center justify-between">
              <span class="text-text-secondary">传输方式</span>
              <span class="text-text font-mono text-xs">{{ server.outputTransport }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-4 border-t border-[rgba(0,0,0,0.04)] bg-[rgba(245,245,247,0.5)] flex justify-end">
          <button
            @click="close"
            class="px-6 py-2 rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white text-text text-sm font-medium cursor-pointer transition-all hover:bg-surface-secondary"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  server: { type: Object, default: null },
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const copied = ref(false)

const initial = computed(() => {
  const name = props.server?.name || ''
  return name.charAt(0).toUpperCase()
})

/** 拼接 SSE URL */
const sseUrl = computed(() => {
  if (!props.server) return ''
  const baseUrl = (props.server.baseUrl || '').replace(/\/+$/, '')
  const ssePath = props.server.ssePath || ''
  return baseUrl + ssePath
})

/** 构建 MCP 客户端配置 JSON */
const mcpConfigJson = computed(() => {
  if (!props.server) return ''
  const name = props.server.name || 'mcp-server'
  const config = {
    mcpServers: {
      [name]: {
        url: sseUrl.value,
      },
    },
  }
  return JSON.stringify(config, null, 2)
})

const close = () => emit('close')
const closeOnOverlay = (e) => { if (e.target === e.currentTarget) close() }

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) { console.error('Failed to copy:', err) }
}
</script>
