<template>
  <section class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-base font-semibold text-text">CLI 工具 skillctl</h3>
        <p class="text-sm text-text-secondary mt-1">使用本地命令行安装/管理 Skill</p>
      </div>
      <span v-if="version" class="text-xs text-text-tertiary bg-surface-secondary px-2.5 py-1 rounded-full">v{{ version }}</span>
    </div>

    <!-- 下载区域 -->
    <div class="mb-5 rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary px-4 py-3">
      <div class="text-xs text-text-tertiary mb-2.5">下载最新版本</div>
      <div class="flex flex-wrap gap-2">
        <a
          v-for="(item, i) in platforms"
          :key="i"
          :href="item.url"
          :download="item.filename"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,0,0,0.08)] bg-white hover:bg-surface-secondary transition-colors cursor-pointer no-underline text-text"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </a>
      </div>
    </div>

    <!-- Token -->
    <div class="mb-5 rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary px-4 py-3">
      <div class="text-xs text-text-tertiary mb-1.5">你的登录 Token</div>

      <!-- 加载中 -->
      <div v-if="tokenLoading" class="text-sm text-text-tertiary">加载中...</div>

      <!-- 报错 -->
      <div v-else-if="tokenError" class="flex items-center gap-3">
        <span class="text-sm text-red-500">{{ tokenError }}</span>
        <button type="button" @click="fetchToken" class="ml-auto px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,0,0,0.08)] text-text-secondary hover:bg-white transition-colors">重试</button>
      </div>

      <!-- 无 token:生成 -->
      <div v-else-if="!token" class="flex items-center gap-3">
        <span class="text-sm text-text-tertiary">未生成</span>
        <button type="button" @click="generateToken" :disabled="generating"
          class="ml-auto px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
          {{ generating ? '生成中...' : '生成 Token' }}
        </button>
      </div>

      <!-- 有 token:显示 + 复制 + 刷新 -->
      <div v-else class="flex items-center gap-3">
        <code class="font-mono text-sm text-text-secondary select-all break-all">{{ token }}</code>
        <button type="button" @click="copyToken"
          class="px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,0,0,0.08)] hover:bg-white transition-colors"
          :class="copied ? 'text-green-600 border-green-200 bg-green-50' : 'text-text-secondary'">
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button type="button" @click="refreshToken" :disabled="generating"
          class="px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,0,0,0.08)] text-text-secondary hover:bg-white transition-colors disabled:opacity-50">
          {{ generating ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <p class="text-[11px] text-text-tertiary mt-1.5">使用此 Token 通过 skillctl 登录 1Panel Skills Hub;刷新会使旧 Token 立即失效。</p>
    </div>

    <!-- 6 条主命令 -->
    <div class="mb-5">
      <div class="text-sm font-medium text-text mb-3">快速参考</div>
      <ul class="space-y-2.5 text-sm">
        <li v-for="(item, i) in commands" :key="i" class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <code class="font-mono text-[12.5px] text-text bg-surface-secondary px-2 py-1 rounded-md break-all sm:shrink-0">{{ item.cmd }}</code>
          <span class="text-text-secondary text-[13px]">{{ item.desc }}</span>
        </li>
      </ul>
    </div>

    <!-- 完整文档链接 -->
    <div class="pt-4 border-t border-[rgba(0,0,0,0.06)]">
      <router-link
        to="/docs?chapter=skillctl"
        class="text-sm text-text hover:underline inline-flex items-center gap-1"
      >查看完整在线文档 →</router-link>
    </div>

    <!-- 刷新确认弹框:用项目统一 AppDialog,不用浏览器原生 confirm -->
    <AppDialog
      :open="showRefreshDialog"
      title="刷新 Token"
      message="刷新后旧 Token 立即失效，确认刷新？"
      type="confirm"
      cancelText="取消"
      confirmText="确认刷新"
      @close="showRefreshDialog = false"
      @confirm="confirmRefresh"
    />
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppDialog from './AppDialog.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const version = ref('')
const token = ref('')
const tokenLoading = ref(false)
const tokenError = ref('')
const generating = ref(false)
const copied = ref(false)
const showRefreshDialog = ref(false)
const featureFlags = ref({ panelEndpoint: '' })

const fetchToken = async () => {
  tokenLoading.value = true
  tokenError.value = ''
  try {
    const t = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/skillctl-token`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    let data = null
    try { data = await res.json() } catch { /* non-JSON body */ }
    if (!res.ok) {
      tokenError.value = data?.reason || data?.error || '获取 Token 失败'
    } else {
      token.value = data?.token || ''
    }
  } catch (e) {
    tokenError.value = '获取 Token 失败'
  } finally {
    tokenLoading.value = false
  }
}

const generateToken = async () => {
  if (generating.value) return
  generating.value = true
  tokenError.value = ''
  try {
    const t = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/skillctl-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    })
    let data = null
    try { data = await res.json() } catch { /* non-JSON body */ }
    if (!res.ok) {
      tokenError.value = data?.reason || data?.error || '生成 Token 失败'
    } else {
      token.value = data?.token || ''
    }
  } catch (e) {
    tokenError.value = '生成 Token 失败'
  } finally {
    generating.value = false
  }
}

const refreshToken = () => {
  if (generating.value) return
  showRefreshDialog.value = true
}

const confirmRefresh = async () => {
  showRefreshDialog.value = false
  await generateToken()
}

const copyToken = async () => {
  if (!token.value) return
  try {
    await navigator.clipboard.writeText(token.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* ignore */ }
}

const platforms = [
  { icon: '🪟', label: 'Windows x86_64', url: '/downloads/skillctl-windows-amd64.zip', filename: 'skillctl-windows-amd64.zip' },
  { icon: '🍎', label: 'macOS Intel', url: '/downloads/skillctl-darwin-amd64', filename: 'skillctl-darwin-amd64' },
  { icon: '🍎', label: 'macOS Apple Silicon', url: '/downloads/skillctl-darwin-arm64', filename: 'skillctl-darwin-arm64' },
  { icon: '🐧', label: 'Linux x86_64', url: '/downloads/skillctl-linux-amd64', filename: 'skillctl-linux-amd64' },
  { icon: '🐧', label: 'Linux ARM64', url: '/downloads/skillctl-linux-arm64', filename: 'skillctl-linux-arm64' },
]

const cmdTemplates = [
  { cmd: (ep, tk) => {
    let c = ep ? `skillctl login ${ep} --token <token>` : 'skillctl login <endpoint> --token <token>'
    if (tk) c = c.replace('<token>', tk)
    return c
  }, desc: '登录 1Panel' },
  { cmd: () => 'skillctl whoami', desc: '查看当前登录身份' },
  { cmd: () => 'skillctl agent create default --skills-path /path/to/skills', desc: '创建 Agent' },
  { cmd: () => 'skillctl agent list', desc: '查看 Agent 列表' },
  { cmd: () => 'skillctl search [keyword]', desc: '搜索 Skill' },
  { cmd: () => 'skillctl install <skill-name>', desc: '安装 Skill' },
]

const commands = computed(() =>
  cmdTemplates.map(t => ({ cmd: t.cmd(featureFlags.value.panelEndpoint, token.value), desc: t.desc }))
)

const loadFeatureFlags = async () => {
  try {
    const res = await fetch(`${API_BASE}/config/feature-flags`)
    if (res.ok) {
      const data = await res.json()
      featureFlags.value = data
    }
  } catch (e) { console.warn('loadFeatureFlags failed:', e) }
}

onMounted(async () => {
  fetchToken()
  loadFeatureFlags()
  try {
    const res = await fetch(`${API_BASE}/version`)
    const data = await res.json()
    version.value = data.version || ''
  } catch {
    // ignore
  }
})
</script>
