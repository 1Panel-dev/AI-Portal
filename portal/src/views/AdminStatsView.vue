<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[1000px] mx-auto px-6 py-10 pt-[132px]">
      <!-- Admin Nav -->
      <div class="flex items-center gap-4 mb-6">
        <button @click="$router.push('/admin/stats')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/stats' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">数据统计</button>

        <button @click="$router.push('/admin')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">审核管理</button>
        <button @click="$router.push('/admin/skills')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/skills' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">技能管理</button>
        <button @click="$router.push('/admin/users')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/users' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">用户管理</button>
        <button @click="$router.push('/admin/config')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/config' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">系统配置</button>
        <button @click="$router.push('/admin/oauth')" class="px-4 py-2 text-sm font-medium rounded-lg transition-all" :class="$route.path === '/admin/oauth' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'">第三方登录</button>
      </div>

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">数据统计</h1>
          <p class="text-text-secondary text-sm mt-1">AI 使用情况全局概览</p>
        </div>
        <button @click="logout" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all">退出登录</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">加载中...</div>

      <!-- Error / No 1Panel Config -->
      <div v-else-if="!panelConfigured" class="text-center py-20">
        <div class="text-4xl mb-4">⚙️</div>
        <p class="text-text-secondary mb-2">尚未配置 1Panel 网关</p>
        <p class="text-sm text-text-tertiary mb-4">请先在「系统配置」中填写 1Panel Base URL 和 API Key</p>
        <button @click="$router.push('/admin/config')" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all">前往配置</button>
      </div>

      <template v-else-if="data">
        <!-- 筛选栏 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
          <span class="text-xs font-semibold text-text-secondary uppercase tracking-wide">筛选</span>
          <div class="h-5 w-px bg-[rgba(0,0,0,0.06)]"></div>
          <span class="text-xs text-text-secondary">时间</span>
          <button v-for="r in timeRanges" :key="r.value" @click="selectedDays = r.value" class="px-3 py-1 text-xs rounded-md border transition-all" :class="selectedDays === r.value ? 'bg-accent text-white border-accent' : 'border-[rgba(0,0,0,0.08)] hover:border-accent text-text-secondary'">{{ r.label }}</button>
          <div class="h-5 w-px bg-[rgba(0,0,0,0.06)]"></div>
          <span class="text-xs text-text-secondary">用户名</span>
          <input v-model="usernameFilter" @keyup.enter="searchUser" placeholder="搜索用户名..." class="px-2 py-1 text-xs border border-[rgba(0,0,0,0.08)] rounded-md bg-white outline-none w-32 focus:border-accent" />
          <div class="h-5 w-px bg-[rgba(0,0,0,0.06)]"></div>
          <span class="text-xs text-text-secondary">用户</span>
          <select v-model="selectedUser" class="px-2 py-1 text-xs border border-[rgba(0,0,0,0.08)] rounded-md bg-white outline-none cursor-pointer">
            <option value="">全部用户</option>
            <option v-for="u in userList" :key="u.id" :value="u.id">{{ u.display_name || u.name }}</option>
          </select>
          <div class="flex-1"></div>
          <button v-if="selectedUser || selectedDays || usernameFilter" @click="clearFilters" class="text-xs text-accent hover:underline">清除筛选</button>
        </div>

        <!-- 统计卡片 -->
        <div class="grid grid-cols-4 gap-4 mb-4">
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-xs text-text-secondary mb-1">总请求数</div>
            <div class="text-xl font-bold text-text">{{ fmt(summary.requestCount) }}</div>
          </div>
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-xs text-text-secondary mb-1">总 Tokens</div>
            <div class="text-xl font-bold text-text">{{ fmtTokens(summary.totalTokens) }}</div>
          </div>
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-xs text-text-secondary mb-1">活跃用户</div>
            <div class="text-xl font-bold text-text">{{ summary.activeUsers }}</div>
          </div>
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-xs text-text-secondary mb-1">失败请求</div>
            <div class="text-xl font-bold text-red-500">{{ summary.failedRequests }}</div>
          </div>
        </div>

        <!-- 主内容 -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <!-- 趋势图 -->
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 col-span-2">
            <div class="text-sm font-semibold text-text mb-3">📈 请求 &amp; Tokens 趋势</div>
            <div class="flex items-end gap-1 h-40">
              <div v-for="(t, i) in trends" :key="i" class="flex-1 flex flex-col items-center gap-0.5 relative group">
                <div class="w-full flex gap-px items-end justify-center" style="height:120px">
                  <div class="w-1.5 bg-accent rounded-t" :style="{ height: barHeight(t.totalTokens, maxTrendToken) + 'px' }"></div>
                </div>
                <div class="text-[10px] text-text-tertiary truncate w-full text-center">{{ t.name.slice(5) }}</div>
                <!-- Hover tooltip -->
                <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                  <div class="bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none">
                    <div class="font-semibold mb-1">{{ t.name }}</div>
                    <div class="space-y-0.5">
                      <div class="flex justify-between gap-4"><span>输入</span><span class="text-slate-300">{{ fmtTokens(t.promptTokens) }}</span></div>
                      <div class="flex justify-between gap-4"><span>输出</span><span class="text-slate-300">{{ fmtTokens(t.completionTokens) }}</span></div>
                      <div class="flex justify-between gap-4"><span>缓存</span><span class="text-slate-300">{{ fmtTokens(t.cachedTokens) }}</span></div>
                      <div class="border-t border-slate-600 mt-1 pt-1 flex justify-between gap-4 font-semibold"><span>总量</span><span>{{ fmtTokens(t.totalTokens) }}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-4 mt-2 text-xs text-text-secondary">
              <span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-accent rounded-sm inline-block"></span>Total Tokens</span>
              <span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-amber-500 rounded-sm inline-block"></span>请求数</span>
            </div>
          </div>

          <!-- Provider / 模型 / Tokens -->
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm font-semibold text-text">📋 分布</div>
              <div class="flex gap-1 bg-surface-secondary rounded-md p-0.5">
                <button v-for="tab in distTabs" :key="tab.key" @click="distTab = tab.key" class="px-2 py-0.5 text-xs rounded transition-all" :class="distTab === tab.key ? 'bg-white text-text shadow-sm' : 'text-text-secondary hover:text-text'">{{ tab.label }}</button>
              </div>
            </div>
            <!-- Provider -->
            <div v-if="distTab === 'provider'" class="space-y-2">
              <div v-for="p in providers" :key="p.name" class="flex items-center gap-2">
                <span class="text-xs text-text-secondary w-16 truncate">{{ p.name || '未分类' }}</span>
                <div class="flex-1 h-5 bg-surface-secondary rounded overflow-hidden">
                  <div class="h-full bg-accent rounded" :style="{ width: pct(p.requestCount, maxProvider) + '%' }"></div>
                </div>
                <span class="text-xs text-text-tertiary w-12 text-right">{{ fmt(p.requestCount) }}</span>
              </div>
            </div>
            <!-- 模型 -->
            <div v-else-if="distTab === 'model'" class="space-y-2">
              <div v-for="m in topModels" :key="m.name" class="flex items-center gap-2">
                <span class="text-xs text-text-secondary w-20 truncate" :title="m.name">{{ m.name }}</span>
                <div class="flex-1 h-5 bg-surface-secondary rounded overflow-hidden">
                  <div class="h-full bg-emerald-500 rounded" :style="{ width: pct(m.requestCount, maxModel) + '%' }"></div>
                </div>
                <span class="text-xs text-text-tertiary w-12 text-right">{{ fmt(m.requestCount) }}</span>
              </div>
            </div>
            <!-- Tokens -->
            <div v-else class="space-y-3">
              <div>
                <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Prompt</span><span class="text-text-tertiary">{{ fmtTokens(summary.promptTokens) }}</span></div>
                <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-accent rounded" :style="{ width: pct(summary.promptTokens, summary.totalTokens) + '%' }"></div></div>
              </div>
              <div>
                <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Completion</span><span class="text-text-tertiary">{{ fmtTokens(summary.completionTokens) }}</span></div>
                <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-amber-500 rounded" :style="{ width: pct(summary.completionTokens, summary.totalTokens) + '%' }"></div></div>
              </div>
              <div>
                <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Cached</span><span class="text-text-tertiary">{{ fmtTokens(summary.cachedTokens) }}</span></div>
                <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-emerald-400 rounded" :style="{ width: pct(summary.cachedTokens, summary.totalTokens) + '%' }"></div></div>
              </div>
            </div>
          </div>

          <!-- 红黑榜 -->
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-sm font-semibold text-text mb-3">🏆 用户排行</div>
            <div v-if="selectedUser" class="text-xs text-accent mb-2">当前用户：{{ selectedUserName }}</div>
            <div class="space-y-1.5">
              <div v-for="(u, i) in topUsers" :key="u.userId" class="flex items-center gap-2 py-1 border-b border-[rgba(0,0,0,0.03)] last:border-0" :class="{ 'bg-accent/5 -mx-2 px-2 rounded': selectedUser && u.userId === selectedUser }">
                <span class="text-xs font-bold w-4 text-center" :class="i < 3 ? 'text-accent' : 'text-text-tertiary'">{{ i + 1 }}</span>
                <span class="text-xs text-text flex-1 truncate">{{ u.display_name || u.name }}</span>
                <div class="w-16 h-1.5 bg-surface-secondary rounded overflow-hidden">
                  <div class="h-full bg-accent rounded" :style="{ width: pct(u.totalTokens, topUsers[0]?.totalTokens || 1) + '%' }"></div>
                </div>
                <span class="text-xs text-text-tertiary w-14 text-right">{{ fmtTokens(u.totalTokens) }}</span>
              </div>
            </div>
            <div class="text-sm font-semibold text-text mt-4 mb-2">📉 Bottom 10</div>
            <div class="space-y-1.5">
              <div v-for="(u, i) in bottomUsers" :key="u.userId" class="flex items-center gap-2 py-1 border-b border-[rgba(0,0,0,0.03)] last:border-0" :class="{ 'bg-accent/5 -mx-2 px-2 rounded': selectedUser && u.userId === selectedUser }">
                <span class="text-xs font-bold w-4 text-center text-text-tertiary">{{ i + 1 }}</span>
                <span class="text-xs text-text flex-1 truncate">{{ u.display_name || u.name }}</span>
                <div class="w-16 h-1.5 bg-surface-secondary rounded overflow-hidden">
                  <div class="h-full bg-slate-300 rounded" :style="{ width: pct(u.totalTokens, bottomUsers[0]?.totalTokens || 1) + '%' }"></div>
                </div>
                <span class="text-xs text-text-tertiary w-14 text-right">{{ fmtTokens(u.totalTokens) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="text-center py-20 text-text-secondary">暂无数据</div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()

const loading = ref(true)
const data = ref(null)
const panelConfigured = ref(true)
const selectedDays = ref(30)
const selectedUser = ref('')
const distTab = ref('provider')
const users = ref([])
const usernameFilter = ref('')

const timeRanges = [
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
  { label: '全部', value: null },
]

const distTabs = [
  { key: 'provider', label: 'Provider' },
  { key: 'model', label: '模型' },
  { key: 'tokens', label: 'Tokens' },
]

const summary = computed(() => data.value?.summary || {})
const trends = computed(() => {
  const all = data.value?.trends || []
  if (!selectedDays.value) return all
  return all.slice(-selectedDays.value)
})
const providers = computed(() => (data.value?.providers || []).filter(p => p.name && p.name.trim()))
const models = computed(() => (data.value?.models || []).filter(m => m.name && m.name.trim()).sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0)))

const topModels = computed(() => models.value.slice(0, 10))
const maxProvider = computed(() => Math.max(...providers.value.map(p => p.requestCount || 0), 1))
const maxModel = computed(() => Math.max(...topModels.value.map(m => m.requestCount || 0), 1))
const maxTrendToken = computed(() => Math.max(...trends.value.map(t => t.totalTokens || 0), 1))

const userList = computed(() => users.value)
const selectedUserName = computed(() => {
  if (!selectedUser.value) return ''
  const u = users.value.find(x => x.id === selectedUser.value)
  return u ? (u.display_name || u.name) : selectedUser.value
})

const rankedUsers = computed(() => {
  const list = data.value?.users || []
  return list
})
const topUsers = computed(() => rankedUsers.value.slice(0, 10))
const bottomUsers = computed(() => rankedUsers.value.slice(-10).reverse())

const getToken = () => localStorage.getItem('admin_token')

const fmt = (n) => {
  if (!n && n !== 0) return '0'
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toLocaleString()
}
const fmtTokens = (n) => {
  if (!n && n !== 0) return '0'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString()
}
const pct = (v, max) => Math.max(2, (v / max) * 100)
const barHeight = (val, max) => Math.max(2, (val / max) * 118)

async function fetchStats() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (selectedDays.value) params.set('days', String(selectedDays.value))
    if (selectedUser.value) params.set('userId', String(selectedUser.value))
    const [statsRes, usersRes] = await Promise.all([
      fetch(`${API_BASE}/admin/usage-statistics?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      fetch(`${API_BASE}/admin/portal-users/map`, { headers: { Authorization: `Bearer ${getToken()}` } }),
    ])
    if (statsRes.ok) {
      data.value = await statsRes.json()
    } else if (statsRes.status === 502) {
      const err = await statsRes.json().catch(() => ({}))
      panelConfigured.value = false
      data.value = null
    }
    if (usersRes.ok) {
      const map = await usersRes.json()
      users.value = Object.entries(map).map(([id, display_name]) => ({ id: Number(id), display_name }))
    }
  } catch (e) {
    console.error('获取统计失败:', e)
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  selectedDays.value = null
  selectedUser.value = ''
  usernameFilter.value = ''
}

function searchUser() {
  const kw = usernameFilter.value.trim().toLowerCase()
  if (!kw) { selectedUser.value = ''; return }
  const found = users.value.find(u => (u.display_name || u.name).toLowerCase().includes(kw))
  selectedUser.value = found ? found.id : ''
}

watch([selectedDays, selectedUser], () => {
  fetchStats()
})

const logout = () => { localStorage.removeItem('admin_token'); localStorage.removeItem('user'); router.push('/admin/login') }

onMounted(() => {
  const token = getToken()
  if (!token) { router.push('/admin/login'); return }
  fetchStats()
})
</script>
