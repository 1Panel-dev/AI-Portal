<template>
  <div>
    <NavBar />
    <!-- Hero -->
    <section class="pb-8 text-center max-w-[720px] mx-auto animate-fade-up" :class="hasVisibleBanner ? 'pt-[248px]' : 'pt-[208px]'">
      <h1 class="text-[52px] font-bold text-text tracking-[-1.6px] leading-[1.05] mb-3 max-md:text-[40px] max-sm:text-[32px]">查找可调用的 AI 模型</h1>
      <p class="text-[18px] text-text-secondary font-normal mb-6 leading-relaxed">按标签与供应商浏览，点击模型卡片查看能力与调用方式</p>
      <div class="flex justify-center gap-11 mt-2">
        <div class="text-center"><div class="text-[22px] font-bold text-text">{{ providerCount }}</div><div class="text-[12px] text-text-secondary mt-0.5">供应商</div></div>
        <div class="text-center"><div class="text-[22px] font-bold text-text">{{ filteredModelCount }}</div><div class="text-[12px] text-text-secondary mt-0.5">模型</div></div>
      </div>
    </section>

    <!-- 左右布局 -->
    <section class="max-w-[1240px] mx-auto px-6 pb-12">
      <div v-if="loading" class="text-center py-20"><p class="text-text-secondary text-sm">加载中...</p></div>

      <div v-else-if="permError" class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <div class="text-sm text-red-700">{{ permError }}</div>
      </div>

      <div v-else-if="hint" class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-amber-900">{{ hint }}</div>
          <button @click="fetchModels" class="mt-1 text-xs text-amber-800 underline hover:text-amber-950">重新加载</button>
        </div>
      </div>

      <div v-else class="flex gap-7 items-start">
        <!-- 左栏 -->
        <aside class="w-[208px] shrink-0 sticky top-[64px]">
          <div class="mb-6">
            <div class="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2.5 pl-3">标签</div>
            <div class="flex flex-col gap-0.5">
              <button @click="currentTag = ''" class="flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer select-none" :class="currentTag === '' ? 'bg-accent/8 text-accent font-medium' : 'text-text-secondary hover:bg-black/[0.03]'">
                <span>全部标签</span><span class="text-[11px] tabular-nums" :class="currentTag === '' ? 'text-accent/60' : 'text-text-tertiary'">{{ publicModelCount }}</span>
              </button>
              <button v-for="t in tagsWithCount" :key="t.id" @click="currentTag = currentTag === t.id ? '' : t.id" class="flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer select-none" :class="currentTag === t.id ? 'bg-accent/8 text-accent font-medium' : 'text-text-secondary hover:bg-black/[0.03]'">
                <span class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>{{ t.name }}</span>
                <span class="text-[11px] tabular-nums" :class="currentTag === t.id ? 'text-accent/60' : 'text-text-tertiary'">{{ t.count }}</span>
              </button>
              <div v-if="!tagsWithCount.length" class="px-3 py-2 text-[12px] text-text-tertiary">暂无标签</div>
            </div>
          </div>
          <div>
            <div class="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2.5 pl-3">供应商</div>
            <div class="flex flex-col gap-0.5">
              <button @click="currentProvider = ''" class="flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer select-none" :class="currentProvider === '' ? 'bg-accent/8 text-accent font-medium' : 'text-text-secondary hover:bg-black/[0.03]'">
                <span>全部供应商</span><span class="text-[11px] tabular-nums" :class="currentProvider === '' ? 'text-accent/60' : 'text-text-tertiary'">{{ publicModelCount }}</span>
              </button>
              <button v-for="p in providersWithCount" :key="p.key" @click="currentProvider = currentProvider === p.key ? '' : p.key" class="flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer select-none" :class="currentProvider === p.key ? 'bg-accent/8 text-accent font-medium' : 'text-text-secondary hover:bg-black/[0.03]'">
                <span class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: providerColor(p.key) }"></span>{{ p.label }}</span>
                <span class="text-[11px] tabular-nums" :class="currentProvider === p.key ? 'text-accent/60' : 'text-text-tertiary'">{{ p.count }}</span>
              </button>
            </div>
          </div>
        </aside>

        <!-- 右侧 -->
        <main class="flex-1 min-w-0">
          <!-- 搜索栏 -->
          <div class="flex items-center gap-2.5 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-2.5 mb-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <svg class="text-text-tertiary shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input v-model="searchQuery" type="text" placeholder="搜索模型名 / 供应商..." class="flex-1 border-none outline-none bg-transparent text-[13px] text-text placeholder:text-text-tertiary" />
          </div>

          <!-- 卡片网格 -->
          <div v-if="pagedModels.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="m in pagedModels" :key="m.id"
              class="model-card group bg-white border border-[rgba(0,0,0,0.04)] rounded-card p-6 relative flex flex-col transition-all duration-300 ease-out cursor-pointer hover:-translate-y-0.5 hover:border-[rgba(10,132,255,0.22)] hover:shadow-[0_16px_40px_rgba(10,132,255,0.10)]" @click="openDetail(m)">

              <!-- 复制按钮 -->
              <button @click.stop="copyModel(m)" class="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-[rgba(0,0,0,0.08)] hover:bg-surface-secondary" :class="copiedModelId === m.id ? '!opacity-100 text-emerald-500 border-emerald-200 bg-emerald-50' : 'text-text-tertiary'" title="复制模型名">
                <svg v-if="copiedModelId !== m.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>

              <!-- 标题区 -->
              <div class="pr-10 mb-2">
                <div class="text-[15px] font-semibold text-text leading-snug tracking-[-0.1px]">{{ m.display_name || m.model_name }}</div>
                <div v-if="m.api_model_name && m.api_model_name !== (m.display_name || m.model_name)" class="text-[11px] text-text-tertiary mt-0.5 font-mono">API: {{ m.api_model_name }}</div>
                <div class="flex items-center gap-1.5 mt-1.5">
                  <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: providerColor(m.provider) }"></span>
                  <span class="text-[12px] text-text-tertiary">{{ providerLabel(m.provider) }}</span>
                </div>
              </div>

              <!-- 描述 -->
              <p v-if="m.description" class="text-[13px] text-text-secondary leading-relaxed line-clamp-2 mb-3 flex-1">{{ m.description }}</p>
              <div v-else class="flex-1"></div>

              <!-- 底部：能力指标（数值一行 + 能力标签单独一行） -->
              <div class="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-text-tertiary mb-2">
                <span v-if="m.context_window" class="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  上下文 {{ formatTokens(m.context_window) }}
                </span>
                <span v-if="m.max_output_tokens" class="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
                  最大输出 {{ formatTokens(m.max_output_tokens) }}
                </span>
              </div>
              <div v-if="m.multimodal || m.tool_calling || m.image_input || m.cache_enabled" class="flex items-center gap-1.5 flex-wrap mb-3">
                <span v-if="m.multimodal" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium text-[11px]">多模态</span>
                <span v-if="m.tool_calling" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-medium text-[11px]">工具调用</span>
                <span v-if="m.image_input" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium text-[11px]">图片输入</span>
                <span v-if="m.cache_enabled" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium text-[11px]">缓存</span>
              </div>
              <div v-else class="mb-3"></div>

              <!-- 底部标签 -->
              <div v-if="m.tags && m.tags.length" class="flex flex-wrap gap-1.5 pt-3 border-t border-[rgba(0,0,0,0.04)]">
                <span v-for="tag in m.tags.slice(0, 4)" :key="tag.id" class="px-2 py-[3px] rounded-md text-[11px] font-medium" :style="{ backgroundColor: `${tag.color}10`, color: tag.color }">{{ tag.name }}</span>
                <span v-if="m.tags.length > 4" class="px-2 py-[3px] rounded-md text-[11px] font-medium bg-surface-secondary text-text-tertiary">+{{ m.tags.length - 4 }}</span>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-text-secondary text-[13px] py-20">
            {{ searchQuery || currentTag || currentProvider ? '没有匹配的模型' : '暂无模型数据' }}
          </div>

          <Pagination v-if="filteredModelCount > 0" class="pt-5" :page="page" :total-pages="totalPages" :total="filteredModelCount" label="个模型" show-first-last :page-size="pageSize" @change="goPage" @page-size-change="onPageSizeChange" />
        </main>
      </div>
    </section>

    <!-- 模型详情抽屉 -->
    <AppDrawer :open="!!detail" :title="detail?.display_name || detail?.model_name || ''" width="full" @close="detail = null">
      <template #title-extra v-if="detail">
        <button class="copy-btn shrink-0" :class="{ done: copiedRow === 'model' }" @click="copyText(detail.api_model_name || detail.model_name, 'model')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {{ copiedRow === 'model' ? '已复制' : '复制' }}
        </button>
      </template>
      <template v-if="detail">
        <div class="flex items-center gap-1.5 mb-2">
          <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: providerColor(detail.provider) }"></span>
          <span class="text-xs text-text-tertiary">{{ providerLabel(detail.provider) }}</span>
        </div>
        <div v-if="detail.api_model_name && detail.api_model_name !== (detail.display_name || detail.model_name)" class="text-xs text-text-tertiary mb-1 font-mono">API: {{ detail.api_model_name }}</div>

        <!-- 描述 -->
        <p v-if="detail.description" class="text-sm text-text-secondary leading-relaxed mb-5">{{ detail.description }}</p>

        <!-- 标签 -->
        <div v-if="detail.tags && detail.tags.length" class="mb-5">
          <div class="panel-title">标签</div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="tag in detail.tags" :key="tag.id" class="px-2 py-1 rounded-md text-xs font-medium" :style="{ backgroundColor: `${tag.color}10`, color: tag.color }">{{ tag.name }}</span>
          </div>
        </div>

        <!-- 模型能力：仅上下文 + 输出 -->
        <div class="mb-5">
          <div class="panel-title">模型能力</div>
          <div class="cap-grid">
            <div class="cap-item"><div class="k">上下文长度</div><div class="v" v-if="detail.context_window">{{ formatTokens(detail.context_window) }} <span class="unit">tokens</span></div><div class="v muted" v-else>—</div></div>
            <div class="cap-item"><div class="k">最大输出</div><div class="v" v-if="detail.max_output_tokens">{{ formatTokens(detail.max_output_tokens) }} <span class="unit">tokens</span></div><div class="v muted" v-else>—</div></div>
          </div>
        </div>

        <!-- 特色标签：多模态 / 工具调用 / 图片输入 / 缓存 -->
        <div v-if="detail.multimodal || detail.tool_calling || detail.image_input || detail.cache_enabled" class="flex flex-wrap gap-1.5 mb-5">
          <span v-if="detail.multimodal" class="cap-tag cap-tag-violet">多模态</span>
          <span v-if="detail.tool_calling" class="cap-tag cap-tag-sky">工具调用</span>
          <span v-if="detail.image_input" class="cap-tag cap-tag-indigo">图片输入</span>
          <span v-if="detail.cache_enabled" class="cap-tag cap-tag-amber">缓存</span>
        </div>

        <!-- 调用方式 Tab -->
        <div v-if="activeFormats.length" class="mb-6">
          <div class="flex gap-1 border-b border-[rgba(0,0,0,0.06)] mb-4">
            <button
              v-for="(fmt, idx) in activeFormats"
              :key="fmt.id"
              @click="selectedFormatIdx = idx"
              class="px-3 py-2 text-xs font-medium transition-all border-b-2"
              :class="selectedFormatIdx === idx ? 'text-accent border-accent' : 'text-text-secondary border-transparent hover:text-text'"
            >
              <span class="inline-flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="fmt.method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'">{{ fmt.method }}</span>
                {{ fmt.name }}
              </span>
            </button>
          </div>

          <!-- 当前选中调用方式的详情 -->
          <div v-if="activeFormats[selectedFormatIdx]">
            <div class="text-sm text-text-secondary mb-3 py-2 px-3 bg-surface-secondary rounded-lg font-mono break-all">{{ fullUrl(activeFormats[selectedFormatIdx]) }}</div>

            <!-- Curl 示例 -->
            <div class="rounded-xl overflow-hidden bg-[#1a1a2e] shadow-inner">
              <div class="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.08]">
                <span class="h-2 w-2 rounded-full bg-[#ff5f57]"></span>
                <span class="h-2 w-2 rounded-full bg-[#febc2e]"></span>
                <span class="h-2 w-2 rounded-full bg-[#28c840]"></span>
                <span class="ml-2 text-[10px] text-white/35 tracking-wide" style="font-family: 'SF Mono', Consolas, monospace">curl</span>
                <button class="ml-auto px-2 py-0.5 text-[10px] text-white/45 hover:text-white/80 rounded border border-white/10 hover:border-white/20 transition-all" @click.stop="copyText(getFormatCurl(activeFormats[selectedFormatIdx]), 'curl-' + selectedFormatIdx)">
                  {{ copiedRow === 'curl-' + selectedFormatIdx ? '✓' : '复制' }}
                </button>
              </div>
              <pre class="px-4 py-3 text-[12px] leading-[1.7] text-[#e8e8ed] break-all whitespace-pre-wrap" style="font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace"><code v-html="curlHighlighted(getFormatCurl(activeFormats[selectedFormatIdx]))"></code></pre>
            </div>
          </div>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.panel-title { font-size: 13px; font-weight: 600; color: var(--text, #1D2129); margin-bottom: 12px; }
.copy-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; border: 1px solid rgba(0,0,0,0.06); background: #fff; color: #475569; transition: all .15s; white-space: nowrap; }
.copy-btn:hover { border-color: rgba(0,0,0,0.12); color: #1D2129; }
.copy-btn.done { color: #10b981; border-color: #10b981; }
.cap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.cap-item { background: #f5f5f7; border-radius: 12px; padding: 14px; }
.cap-item .k { font-size: 12px; color: #94a3b8; }
.cap-item .v { font-size: 16px; font-weight: 700; margin-top: 4px; color: #1D2129; }
.cap-item .v.muted { color: #94a3b8; font-weight: 400; }
.cap-item .unit { font-size: 11px; font-weight: 400; color: #94a3b8; }
.cap-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.cap-tag-violet { background: rgba(139,92,246,0.1); color: #7c3aed; }
.cap-tag-sky { background: rgba(14,165,233,0.1); color: #0284c7; }
.cap-tag-indigo { background: rgba(99,102,241,0.1); color: #4f46e5; }
.cap-tag-amber { background: rgba(245,158,11,0.1); color: #d97706; }
.fmt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
}
.fmt-method-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}
.fmt-post { background: rgba(59,130,246,0.1); color: #2563eb; }
.fmt-get { background: rgba(16,185,129,0.1); color: #059669; }
.fmt-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #94a3b8;
  transition: all 0.15s;
}
.fmt-copy-btn:hover { color: #475569; background: rgba(0,0,0,0.06); }
.fmt-copy-btn.done { color: #10b981; }
</style>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Pagination from '../components/Pagination.vue'
import NavBar from '../components/NavBar.vue'
import AppDrawer from '../components/AppDrawer.vue'
import { providerLabels } from '../data/categories.js'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'
import { loadPermissions, can, isAdminRoleUser } from '../composables/usePermissions.js'
import { showToast } from '../composables/useToast.js'
import { getLoginToken } from '../lib/apiBase'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()

// ── 状态 ──
const models = ref([])
const allTags = ref([])
const hint = ref('')
const permError = ref('')
const searchQuery = ref('')
const currentTag = ref('')
const currentProvider = ref('')
const copiedModelId = ref(null)
const detail = ref(null)
const selectedFormatIdx = ref(0)
const copiedRow = ref('')
const gatewayUrl = ref('')
const loading = ref(true)
const page = ref(1)
const pageSize = ref(20)

const allFormats = ref([])
function openDetail(m) { detail.value = m; selectedFormatIdx.value = 0 }
const parseFormats = (v) => {
  if (!v) return []
  if (Array.isArray(v)) return v
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
}
const activeFormats = computed(() => {
  if (!detail.value) return []
  const selected = parseFormats(detail.value.invocation_formats)
  // 名称/ID/忽略大小写 解析到规范格式, 去重; 匹配不上的(如旧占位符)丢弃
  const matched = []
  for (const v of selected) {
    const s = String(v)
    const hit =
      allFormats.value.find(f => f.name === s) ||
      allFormats.value.find(f => String(f.id) === s) ||
      allFormats.value.find(f => f.name.toLowerCase() === s.toLowerCase())
    if (hit && !matched.some(m => m.id === hit.id)) matched.push(hit)
  }
  // 按后台配置的排序（sort_order 升序）展示
  matched.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
  // 完全没配置/全落空时, 兜底展示第一个活跃格式
  return matched.length ? matched : allFormats.value.slice(0, 1)
})
const fullUrl = (fmt) => {
  const base = (gatewayUrl.value || 'https://your-gateway.example.com').replace(/\/+$/, '').replace(/\/v1$/, '')
  return `${base}${fmt.endpoint}`
}

// 为指定调用方式生成 curl 示例
const getFormatCurl = (fmt) => {
  if (!detail.value || !fmt) return ''
  const model = detail.value.api_model_name || detail.value.model_name
  const url = fullUrl(fmt)
  const body = fmt.method !== 'GET'
    ? JSON.stringify({ model, messages: [{ role: 'user', content: '你好' }] }, null, 2)
    : null
  let cmd = `curl -X ${fmt.method} ${url}`
  if (fmt.method !== 'GET') {
    cmd += ` \\\n  -H "Content-Type: application/json"`
  }
  if (fmt.name === 'Anthropic Messages') {
    cmd += ` \\\n  -H "x-api-key: sk-xxx"`
    cmd += ` \\\n  -H "anthropic-version: 2023-06-01"`
  } else {
    cmd += ` \\\n  -H "Authorization: Bearer sk-xxx"`
  }
  if (fmt.method !== 'GET') {
    cmd += ` \\\n  -d '${body}'`
  }
  return cmd
}

const curlHighlighted = (cmd) => {
  if (!cmd) return ''
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  return esc(cmd)
    .replace(/\b(curl)\b/g, '<span style="color:#ff6b6b;font-weight:600">$1</span>')
    .replace(/\b(POST|GET|PUT|DELETE)\b/g, '<span style="color:#ffb86c;font-weight:600">$1</span>')
    .replace(/(-[HXd])\b/g, '<span style="color:#8aadff">$1</span>')
    .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, '<span style="color:#5af78e">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#ff9f43">$1</span>')
}

const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

// ── 供应商 ──
const PROVIDER_COLORS = { deepseek: '#4d6bfe', openai: '#10a37f', anthropic: '#d97757', qwen: '#7c3aed', vllm: '#0ea5e9', custom: '#64748b', 'ark-coding-plan': '#f97316' }
const providerColor = (p) => PROVIDER_COLORS[(p || '').toLowerCase()] || '#64748b'
const providerLabel = (p) => providerLabels[(p || '').toLowerCase()] || p || '未知'

// ── 数据拉取 ──
const fetchModels = async () => {
  loading.value = true; hint.value = ''; permError.value = ''
  try {
    const token = getLoginToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`${API_BASE}/models`, { headers })
    if (res.ok) {
      const data = await res.json()
      const flat = []
      for (const g of (data.groups || [])) {
        for (const m of (g.models || [])) flat.push(m)
      }
      models.value = flat
      hint.value = data.hint || ''
    } else if (res.status === 403) {
      permError.value = '你没有查看模型的权限'
    }
  } catch (e) { console.error(e) } finally { loading.value = false }
}

const fetchTags = async () => {
  try {
    const res = await fetch(`${API_BASE}/tags`)
    if (res.ok) { allTags.value = (await res.json()).data || [] }
  } catch (_) {}
}

// ── 公开模型 ──
const publicModels = computed(() => models.value.filter(m => m.is_public !== false))
const publicModelCount = computed(() => publicModels.value.length)

// ── 左栏计数 ──
const tagsWithCount = computed(() => {
  return allTags.value.map(t => ({
    ...t,
    count: publicModels.value.filter(m => (m.tags || []).some(mt => mt.id === t.id)).length,
  })).filter(t => t.count > 0)
})

const providersWithCount = computed(() => {
  const map = new Map()
  for (const m of publicModels.value) {
    const key = (m.provider || 'custom').toLowerCase()
    if (!map.has(key)) map.set(key, { key, label: providerLabel(key), count: 0 })
    map.get(key).count++
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
})

const providerCount = computed(() => providersWithCount.value.length)

// ── 筛选 + 排序 ──
const filteredModels = computed(() => {
  let list = publicModels.value
  if (currentTag.value) list = list.filter(m => (m.tags || []).some(t => t.id === currentTag.value))
  if (currentProvider.value) list = list.filter(m => (m.provider || '').toLowerCase() === currentProvider.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(m => m.model_name.toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q) || (providerLabel(m.provider)).toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q))
  }
  return [...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.model_name.localeCompare(b.model_name))
})

const filteredModelCount = computed(() => filteredModels.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredModels.value.length / pageSize.value)))
const pagedModels = computed(() => {
  const p = Math.min(page.value, totalPages.value)
  const start = (p - 1) * pageSize.value
  return filteredModels.value.slice(start, start + pageSize.value)
})

const goPage = (p) => { if (p >= 1 && p <= totalPages.value) page.value = p }
const onPageSizeChange = (size) => { pageSize.value = size; page.value = 1 }
watch([currentTag, currentProvider, searchQuery], () => { page.value = 1 })

// ── 工具 ──
const formatTokens = (n) => {
  if (!n) return ''
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return String(n)
}

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
}
const copyModel = async (m) => {
  await copyToClipboard(m.api_model_name || m.display_name || m.model_name)
  copiedModelId.value = m.id; setTimeout(() => { copiedModelId.value = null }, 2000)
  showToast('模型名已复制', 'success')
}
const copyText = async (text, key) => {
  if (!text) return
  await copyToClipboard(text)
  copiedRow.value = key; setTimeout(() => { copiedRow.value = '' }, 1500)
  showToast('已复制', 'success')
}

async function fetchGatewayUrl() {
  try {
    const res = await fetch(`${API_BASE}/models/example`)
    if (res.ok) {
      const data = await res.json()
      if (data.endpoint) gatewayUrl.value = data.endpoint
    }
  } catch (_) { /* 静默 */ }
}

const fetchFormats = async () => {
  try {
    const res = await fetch(`${API_BASE}/invocation-formats`)
    if (res.ok) { const d = await res.json(); allFormats.value = d.data || [] }
  } catch (_) {}
}

onMounted(async () => {
  await loadPermissions()
  if (!can('menu:models') && !isAdminRoleUser.value) { router.replace('/'); return }
  fetchModels()
  fetchTags()
  fetchFormats()
  fetchGatewayUrl()
})
</script>
