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
          <div
            class="w-14 h-14 rounded-[14px] flex items-center justify-center text-2xl font-bold shrink-0"
            :style="{ background: avatarColor.bg, color: avatarColor.text }"
          >
            {{ skill.avatar }}
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-[22px] font-bold text-text tracking-[-0.3px]">{{ skill.title }}</h2>
            <div class="flex items-center gap-2 mt-1.5 text-[13px] text-text-secondary">
              <span class="px-2.5 py-[3px] bg-surface-secondary rounded-xl text-xs">{{ categoryLabels[skill.category] || skill.category }}</span>
              <span>by <strong class="text-text">{{ skill.author }}</strong></span>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="p-8 overflow-y-auto max-h-[calc(85vh-100px)]">
          <!-- Description -->
          <div class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              简介
            </h3>
            <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{{ skill.description }}</p>
          </div>

          <!-- skillctl 指令使用说明 -->
          <div class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-3 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
              skillctl 指令使用说明
            </h3>
            <ol class="space-y-3 text-[13px] text-text leading-relaxed list-decimal pl-4 m-0">
              <li>
                下载并安装 skillctl（按平台），详见
                <a href="/docs?chapter=skillctl" target="_blank" class="text-accent underline underline-offset-2 hover:opacity-80">在线文档 → skillctl 命令行说明</a>。
              </li>
              <li>
                登录 1Panel 并配置本地 Skill 安装目录（首次使用）：
                <div class="mt-1.5 space-y-1">
                  <code class="block text-[12px] font-mono text-text bg-surface-secondary rounded-lg px-3 py-1.5">skillctl login &lt;1Panel地址&gt; --token &lt;API-Key&gt;</code>
                  <code class="block text-[12px] font-mono text-text bg-surface-secondary rounded-lg px-3 py-1.5">skillctl agent create default --skills-path &lt;本地skills目录&gt;</code>
                </div>
              </li>
              <li>
                安装 <strong class="text-text">{{ skill.title }}</strong> 技能：
                <code class="block mt-1.5 text-[12px] font-mono text-text bg-surface-secondary rounded-lg px-3 py-1.5">skillctl install {{ skill.slug }}</code>
              </li>
            </ol>
          </div>

          <!-- 最新版下载地址:相对路径文本 + 下载按钮 -->
          <div class="mb-7">
            <h3 class="text-[13px] font-semibold text-text mb-2.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载地址（最新版本）
            </h3>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono text-text break-all min-w-0 flex-1 bg-surface-secondary rounded-lg px-3 py-2">{{ downloadPath }}</code>
              <a :href="latestDownloadUrl" target="_blank" class="shrink-0 px-3 py-2 text-[12px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors no-underline">下载</a>
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
import { computed } from 'vue'
import { avatarColors, categoryLabels } from '../data/categories.js'

const props = defineProps({
  skill: { type: Object, default: null },
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const avatarColor = computed(() => {
  return avatarColors[props.skill?.avatarColor] || { bg: '#e0f2f1', text: '#00695c' }
})

// 下载地址:相对路径用于展示,完整 URL 用于实际下载
const downloadPath = computed(() => props.skill ? `/api/skills/${props.skill.slug}/download` : '')
const latestDownloadUrl = computed(() => props.skill ? `${API_BASE}/skills/${props.skill.slug}/download` : '')

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const close = () => emit('close')
const closeOnOverlay = (e) => { if (e.target === e.currentTarget) close() }
</script>
