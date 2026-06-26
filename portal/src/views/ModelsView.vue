<template>
  <div>
    <NavBar />
    <section class="pt-[170px] pb-12 text-center max-w-[720px] mx-auto animate-fade-up">
      <div class="text-[12px] font-semibold text-text-secondary uppercase tracking-[1.8px] mb-3">
        1Panel AI Gateway
      </div>
      <h1 class="text-[52px] font-bold text-text tracking-[-1.6px] leading-[1.05] mb-3 max-md:text-[40px] max-sm:text-[32px]">
        探索可调用的 AI 模型
      </h1>
      <p class="text-[18px] text-text-secondary font-normal mb-8 leading-relaxed">一键复制调用入口，快速接入企业 AI 能力</p>
      <router-link to="/register"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-text text-white text-[14px] font-medium rounded-xl hover:opacity-85 transition-all no-underline shadow-[0_4px_12px_rgba(0,0,0,0.15)] mb-6">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        申请 API Key 快速体验
      </router-link>
      <div class="max-w-[480px] mx-auto mt-6 relative">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input v-model="searchQuery" type="text" placeholder="搜索模型..."
          class="w-full h-11 bg-white border border-[#d2d2d7] rounded-xl pl-11 pr-5 text-sm text-text outline-none transition-all placeholder:text-text-tertiary focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]">
      </div>
    </section>

    <section class="max-w-[1024px] mx-auto px-6 pb-20">
      <div class="flex justify-center gap-8 mb-10">
        <div class="text-center"><div class="text-xl font-bold text-text">{{ providerCount }}</div><div class="text-xs text-text-secondary mt-0.5">供应商</div></div>
        <div class="text-center"><div class="text-xl font-bold text-text">{{ totalModels }}</div><div class="text-xs text-text-secondary mt-0.5">模型</div></div>
      </div>

      <!-- 调用示例 -->
      <div class="mb-10 animate-fade-up">
        <div class="flex items-center gap-2 mb-4">
          <h2 class="text-[22px] font-semibold tracking-[-0.4px] text-text">调用示例</h2>
        </div>
        <!-- Apple 风深色代码块: 顶栏白底信息+底部深色代码区 -->
        <div class="rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[rgba(0,0,0,0.06)]">
          <!-- Base URL 信息行 -->
          <div class="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-[rgba(0,0,0,0.06)]">
            <span class="text-[11px] font-medium text-text-tertiary uppercase tracking-wider shrink-0">Base URL</span>
            <code class="text-[13px] font-mono text-text truncate flex-1">{{ baseUrl }}</code>
            <button @click="copyText(baseUrl, 'baseurl')"
              class="shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 transition-colors"
              title="复制 Base URL">
              <svg v-if="copiedTarget !== 'baseurl'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
          <!-- 深色 shell 代码区 (来自 system_config.model_example_template) -->
          <div class="relative bg-[#151517] overflow-hidden">
            <div class="flex items-center gap-1.5 border-b border-white/10 px-5 py-2.5">
              <span class="h-2.5 w-2.5 rounded-full bg-[#ff5f57]"></span>
              <span class="h-2.5 w-2.5 rounded-full bg-[#febc2e]"></span>
              <span class="h-2.5 w-2.5 rounded-full bg-[#28c840]"></span>
              <span class="ml-2 text-[11px] font-mono text-white/40">shell</span>
            </div>
            <div class="relative overflow-x-auto px-5 py-4">
              <pre class="text-[12.5px] font-mono leading-[1.85] whitespace-pre"><code v-html="highlightedExample"></code></pre>
              <button @click="copyCurlExample"
                class="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 transition-colors"
                title="复制调用示例">
              <svg v-if="copiedTarget !== 'curl'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a8a8b3" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5af78e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
        </div>
      </div>
      </div>

      <!-- 模型列表标题 -->
      <div v-if="!loading && providerGroups.length > 0" class="mb-4">
        <h2 class="text-[22px] font-semibold tracking-[-0.4px] text-text">模型列表</h2>
        <p class="mt-1 text-[13px] text-text-secondary">点击「复制」即可复制模型名称，可直接填入 API 请求体里的 <code class="font-mono text-text">model</code> 参数。</p>
      </div>

      <!-- FilterBar: 始终常驻,不受 loading/empty 状态影响,避免切换时跳动 -->
      <div v-if="!loading && providerGroups.length > 0" class="mb-6">
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl px-5 h-12 flex items-center gap-3 flex-wrap shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div class="text-[13px] text-text-secondary shrink-0">
            共 <span class="font-semibold text-text">{{ filteredModelCount }}</span> 个模型
          </div>
          <div class="flex-1"></div>
          <div class="shrink-0">
            <FilterItem
              label="供应商"
              :options="providerOptions"
              :model-value="currentProvider"
              @update:model-value="currentProvider = $event"
            />
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center py-20"><p class="text-text-secondary text-sm">加载中...</p></div>

      <!-- 同步失败横幅:仅在 DB 空 + 兜底同步失败时由后端 hint 触发 -->
      <div v-else-if="hint" class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-amber-900">{{ hint }}</div>
          <button @click="fetchModels" class="mt-1 text-xs text-amber-800 underline hover:text-amber-950">重新加载</button>
        </div>
      </div>
      <div v-else-if="filteredProviderGroups.length === 0" class="text-center py-20 min-h-[600px]"><p class="text-text-secondary text-sm">{{ searchQuery || currentProvider !== 'all' ? '没有找到匹配的模型' : '暂无模型数据' }}</p></div>
      <!-- 列表容器固定最小高度: 切换 provider 时短列表也保持容器高度,防止内容塌缩导致页面跳动 -->
      <div v-else class="space-y-10 min-h-[600px]">
        <div v-for="group in filteredProviderGroups" :key="group.provider" class="animate-fade-up">
          <div class="flex items-center gap-2 mb-4">
            <h2 class="text-[18px] font-semibold text-text tracking-[-0.2px]">{{ group.label }}</h2>
            <span class="text-xs text-text-tertiary">· {{ group.provider }}</span>
            <span class="text-xs text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded-full">{{ group.models.length }}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div v-for="model in group.models" :key="model.id"
              class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:shadow-card-hover transition-all">
              <div class="min-w-0 flex-1"><div class="text-sm font-medium text-text truncate">{{ model.model_name }}</div></div>
              <button @click="copyModel(model)"
                class="shrink-0 px-2.5 py-1 text-xs text-text-secondary bg-surface-secondary rounded-lg hover:bg-black/10 transition-colors flex items-center gap-1"
                :class="{ 'text-green-600 !bg-green-50': copiedModelId === model.id }">
                <svg v-if="copiedModelId !== model.id" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {{ copiedModelId === model.id ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import NavBar from '../components/NavBar.vue'
import FilterItem from '../components/FilterItem.vue'
import { providerLabels } from '../data/categories.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const baseUrl = ref('')
const exampleTemplate = ref('')

// 在管理后台修改 system_config.model_example_endpoint / model_example_template 后,刷新页面即可生效
const fetchExampleConfig = async () => {
  try {
    const res = await fetch(`${API_BASE}/models/example`)
    if (res.ok) {
      const data = await res.json()
      if (data.endpoint) baseUrl.value = data.endpoint
      if (data.template) exampleTemplate.value = data.template
    }
  } catch (e) { console.error('Failed to fetch example config:', e) }
}

// 占位符替换:{{base_url}} {{model_name}} {{api_key}}
// model_name / api_key 当前用占位串,后续若选中具体模型可注入
const exampleRendered = computed(() => {
  const tpl = exampleTemplate.value
    || `curl -X POST {{base_url}}/chat/completions \\\n  -H "Authorization: Bearer {{api_key}}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"{{model_name}}","messages":[{"role":"user","content":"你好"}]}'`
  return tpl
    .replace(/\{\{base_url\}\}/g, baseUrl.value)
    .replace(/\{\{model_name\}\}/g, 'model-name')
    .replace(/\{\{api_key\}\}/g, 'sk-xxx')
})

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const highlightedExample = computed(() => escapeHtml(exampleRendered.value)
  .replace(/\b(curl)\b/g, '<span class="text-[#ff6b6b] font-semibold">$1</span>')
  .replace(/\b(POST|GET|PUT|DELETE)\b/g, '<span class="text-[#ffb86c] font-semibold">$1</span>')
  .replace(/(https?:\/\/[^\s&]+)/g, '<span class="text-[#ff9f43]">$1</span>')
  .replace(/(\s-[A-Za-z]\b)/g, '<span class="text-[#8aadff]">$1</span>')
  .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="text-[#5af78e]">$1</span>')
)

const groups = ref([])
const hint = ref('')
const searchQuery = ref('')
const currentProvider = ref('all')
const copiedModelId = ref(null)
const copiedTarget = ref(null)
const loading = ref(true)

const totalModels = computed(() => groups.value.reduce((s, g) => s + g.models.length, 0))

// 按 provider 聚合: 不同 group_name 但同 provider 的模型合并到一块
// 例如 custom → [磊博-agnes 的模型, 磊博-阶跃星辰 的模型]
const providerGroups = computed(() => {
  const map = new Map()
  for (const g of groups.value) {
    const provKey = (g.provider || 'custom').toLowerCase()
    if (!map.has(provKey)) {
      map.set(provKey, {
        provider: provKey,
        label: providerLabels[provKey] || provKey,
        models: [],
      })
    }
    map.get(provKey).models.push(...g.models)
  }
  // 按模型数降序排列(多的在前)
  return [...map.values()].sort((a, b) => b.models.length - a.models.length)
})

const providerCount = computed(() => providerGroups.value.length)

// FilterItem 选项: 全部 + 各 provider
const providerOptions = computed(() => [
  { id: 'all', name: '全部' },
  ...providerGroups.value.map(g => ({ id: g.provider, name: g.label })),
])

// 应用搜索 + provider 过滤
const filteredProviderGroups = computed(() => {
  let list = providerGroups.value

  // provider 过滤
  if (currentProvider.value !== 'all') {
    list = list.filter(g => g.provider === currentProvider.value)
  }

  // 搜索词过滤(在模型名上)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list
      .map(g => ({ ...g, models: g.models.filter(m => m.model_name.toLowerCase().includes(q)) }))
      .filter(g => g.models.length > 0)
  }

  return list
})

const filteredModelCount = computed(() =>
  filteredProviderGroups.value.reduce((s, g) => s + g.models.length, 0)
)

const fetchModels = async () => {
  loading.value = true
  hint.value = ''
  try {
    const res = await fetch(`${API_BASE}/models`)
    if (res.ok) {
      const data = await res.json()
      groups.value = data.groups || []
      // 后端在「DB 为空 + 同步失败」时会带回 hint,展示给用户
      hint.value = data.hint || ''
    }
  } catch (e) {
    console.error('Failed to fetch models:', e)
  } finally {
    loading.value = false
  }
}

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
}

const copyModel = async (model) => {
  await copyToClipboard(model.model_name)
  copiedModelId.value = model.id; setTimeout(() => { copiedModelId.value = null }, 2000)
}

const copyText = async (text, target) => {
  await copyToClipboard(text)
  copiedTarget.value = target; setTimeout(() => { copiedTarget.value = null }, 2000)
}

const copyCurlExample = async () => {
  await copyToClipboard(exampleRendered.value)
  copiedTarget.value = 'curl'; setTimeout(() => { copiedTarget.value = null }, 2000)
}

onMounted(() => {
  fetchModels()
  fetchExampleConfig()
})
</script>
