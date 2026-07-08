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

      <template v-else-if="globalData">
        <!-- 筛选栏 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
          <span class="text-xs font-semibold text-text-secondary uppercase tracking-wide">筛选</span>
          <div class="h-5 w-px bg-[rgba(0,0,0,0.06)]"></div>
          <span class="text-xs text-text-secondary">时间</span>
          <select v-model="selectedMonth" class="px-2 py-1 text-xs border border-[rgba(0,0,0,0.08)] rounded-md bg-white outline-none h-7 focus:border-accent">
            <option value="">全部月份</option>
            <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <div class="h-5 w-px bg-[rgba(0,0,0,0.06)]"></div>
          <span class="text-xs text-text-secondary">用户</span>
          <div class="relative user-picker">
            <input
              v-model="usernameFilter"
              @focus="userDropdownOpen = true"
              @input="onUserInput"
              @keydown.enter.prevent="selectFirstMatch"
              placeholder="选择或输入用户..."
              class="pl-2 pr-6 py-0.5 text-xs border border-[rgba(0,0,0,0.08)] rounded-md bg-white outline-none w-36 focus:border-accent h-7"
            />
            <button
              v-if="selectedUser"
              @click.stop="clearUser"
              class="absolute right-1 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text text-xs leading-none"
              type="button"
            >✕</button>
            <div
              v-if="userDropdownOpen && filteredUsers.length"
              class="absolute top-full mt-1 left-0 w-36 bg-white border border-[rgba(0,0,0,0.08)] rounded-lg shadow-lg z-30 max-h-[180px] overflow-y-auto"
            >
              <div
                v-for="u in filteredUsers"
                :key="u.id"
                @click.stop="pickUser(u)"
                class="px-3 py-1.5 text-xs text-text cursor-pointer hover:bg-accent hover:text-white transition-colors"
              >
                {{ u.display_name }}
              </div>
            </div>
          </div>
          <div class="flex-1"></div>
          <button v-if="selectedUser || usernameFilter || selectedMonth" @click="clearFilters" class="text-xs text-accent hover:underline">清除筛选</button>
        </div>

        <!-- 顶部数据区 -->
        <div class="relative mb-4">
          <!-- 统计卡片 -->
          <div v-if="data" class="grid grid-cols-4 gap-4 mb-4">
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">总请求数</div>
              <div class="text-xl font-bold text-text">{{ fmt(data.summary?.requestCount) }}</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">总 Tokens</div>
              <div class="text-xl font-bold text-text">{{ fmtTokens(data.summary?.totalTokens) }}</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">活跃用户</div>
              <div class="text-xl font-bold text-text">{{ data.summary?.activeUsers }}</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">失败请求</div>
              <div class="text-xl font-bold text-red-500">{{ data.summary?.failedRequests }}</div>
            </div>
          </div>

          <!-- 趋势图 ECharts -->
          <div v-if="data" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 col-span-2">
            <div class="text-sm font-semibold text-text mb-3">📈 请求 &amp; Tokens 趋势</div>
            <div ref="trendChartRef" class="w-full" style="height:220px"></div>
          </div>

          <!-- 顶部 loading 遮罩 -->
          <div v-if="topLoading" class="absolute inset-0 bg-white/70 z-10 flex items-center justify-center rounded-xl">
            <span class="text-sm text-text-secondary">加载中...</span>
          </div>
        </div>

        <!-- 红黑榜 -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-sm font-semibold text-text mb-3">🔥 红榜 Top 10</div>
            <div v-if="selectedUser" class="text-xs text-accent mb-2">当前用户：{{ selectedUserName }}</div>
            <div ref="redChartRef" style="height:280px"></div>
          </div>
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-sm font-semibold text-text mb-3">📉 黑榜 Bottom 10</div>
            <div v-if="selectedUser" class="text-xs text-accent mb-2">当前用户：{{ selectedUserName }}</div>
            <div ref="blackChartRef" style="height:280px"></div>
          </div>
        </div>

        <!-- 分布块 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-text">📊 数据分布</div>
            <div class="flex gap-1 bg-surface-secondary rounded-md p-0.5">
              <button v-for="tab in distTabs" :key="tab.key" @click="switchDistTab(tab.key)" class="px-2 py-0.5 text-xs rounded transition-all" :class="distTab === tab.key ? 'bg-white text-text shadow-sm' : 'text-text-secondary hover:text-text'">{{ tab.label }}</button>
            </div>
          </div>
          <div v-if="distTab === 'provider' || distTab === 'model'" ref="distChartRef" style="height:260px"></div>
          <div v-else class="space-y-3">
            <div>
              <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Prompt</span><span class="text-text-tertiary">{{ fmtTokens(globalData.summary?.promptTokens) }}</span></div>
              <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-accent rounded" :style="{ width: pct(globalData.summary?.promptTokens, globalData.summary?.totalTokens) + '%' }"></div></div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Completion</span><span class="text-text-tertiary">{{ fmtTokens(globalData.summary?.completionTokens) }}</span></div>
              <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-amber-500 rounded" :style="{ width: pct(globalData.summary?.completionTokens, globalData.summary?.totalTokens) + '%' }"></div></div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Cached</span><span class="text-text-tertiary">{{ fmtTokens(globalData.summary?.cachedTokens) }}</span></div>
              <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-emerald-400 rounded" :style="{ width: pct(globalData.summary?.cachedTokens, globalData.summary?.totalTokens) + '%' }"></div></div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="text-center py-20 text-text-secondary">暂无数据</div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()

const loading = ref(true)
const topLoading = ref(false)
const data = ref(null)
const globalData = ref(null)
const panelConfigured = ref(true)
const selectedUser = ref('')
const distTab = ref('provider')
const usersMap = ref({})             // 原始 map: { "1": "张三", "panel_123": "张三", ... }
const usernameFilter = ref('')
const userDropdownOpen = ref(false)
const trendChartRef = ref(null)
const redChartRef = ref(null)
const blackChartRef = ref(null)
const distChartRef = ref(null)
let trendChart = null
let redChart = null
let blackChart = null
let distChart = null

const distTabs = [
  { key: 'provider', label: 'Provider' },
  { key: 'model', label: '模型' },
  { key: 'tokens', label: 'Tokens' },
]

// 月份下拉选项：近 12 个月 + 全部
const monthOptions = (() => {
  const now = new Date()
  const opts = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
    opts.push({ value: val, label })
  }
  return opts
})()
// 默认选中当月
const currentMonthValue = monthOptions[0]?.value || ''
const selectedMonth = ref(currentMonthValue)

const summary = computed(() => data.value?.summary || {})
const trends = computed(() => {
  const all = data.value?.trends || []
  if (selectedMonth.value) {
    const prefix = selectedMonth.value + '-'
    return all.filter(t => String(t.name || '').startsWith(prefix))
  }
  return all
})
const providers = computed(() => (globalData.value?.providers || []).filter(p => p.name && p.name.trim()))
const models = computed(() => (globalData.value?.models || []).filter(m => m.name && m.name.trim()).sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0)))

const topModels = computed(() => models.value.slice(0, 10))
const maxProvider = computed(() => Math.max(...providers.value.map(p => p.requestCount || 0), 1))
const maxModel = computed(() => Math.max(...topModels.value.map(m => m.requestCount || 0), 1))

const userList = computed(() => {
  const portalIds = {} // display_name -> portal_id
  const panelIds = {}  // display_name -> panel_user_id
  for (const [key, display_name] of Object.entries(usersMap.value)) {
    if (key.startsWith('panel_')) {
      panelIds[display_name] = Number(key.slice(6))
    } else {
      portalIds[display_name] = Number(key)
    }
  }
  // 优先用 panel_user_id
  const list = []
  const seen = new Set()
  for (const name of Object.keys(panelIds)) {
    if (name === 'AIProxyUserFallback') continue
    list.push({ id: panelIds[name], display_name: name })
    seen.add(name)
  }
  for (const name of Object.keys(portalIds)) {
    if (!seen.has(name) && name !== 'AIProxyUserFallback') {
      list.push({ id: portalIds[name], display_name: name })
    }
  }
  return list.sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh'))
})
const selectedUserName = computed(() => {
  if (!selectedUser.value) return ''
  const u = userList.value.find(x => x.id === selectedUser.value)
  return u ? u.display_name : selectedUser.value
})

const filteredUsers = computed(() => {
  const kw = usernameFilter.value.trim().toLowerCase()
  const list = userList.value.filter(u => u.id !== selectedUser.value)
  if (!kw) return list
  return list.filter(u => u.display_name.toLowerCase().includes(kw))
})

const rankedUsers = computed(() => {
  return (globalData.value?.users || []).filter(u => u.name !== 'AIProxyUserFallback')
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

function initTrendChart() {
  if (!trendChartRef.value || !data.value?.trends?.length) return
  if (trendChart) { trendChart.dispose(); trendChart = null }
  trendChart = echarts.init(trendChartRef.value)
  const dates = data.value.trends.map(t => t.name)
  const promptData = data.value.trends.map(t => t.promptTokens)
  const completionData = data.value.trends.map(t => t.completionTokens)
  const cachedData = data.value.trends.map(t => t.cachedTokens)
  const totalData = data.value.trends.map(t => (t.promptTokens || 0) + (t.completionTokens || 0) + (t.cachedTokens || 0))

  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.04)' } },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#1D2129', fontSize: 11 },
      formatter: (params) => {
        const date = params[0]?.axisValue || ''
        let html = `<div style="font-weight:600;margin-bottom:4px;color:#1D2129">${date}</div>`
        const map = { promptTokens: '输入', completionTokens: '输出', cachedTokens: '缓存' }
        const colors = { promptTokens: '#3b82f6', completionTokens: '#34d399', cachedTokens: '#f59e0b' }
        params.forEach(p => {
          if (p.seriesName === '总量') return
          html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.8"><span style="color:${colors[p.seriesName] || '#475569'}">● ${map[p.seriesName] || p.seriesName}</span><span style="color:#1D2129;font-weight:500">${fmtTokens(p.value)}</span></div>`
        })
        const total = params.find(p => p.seriesName === '总量')
        if (total) html += `<div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:4px;padding-top:4px;font-weight:600;color:#1D2129">总量: ${fmtTokens(total.value)}</div>`
        return html
      }
    },
    legend: {
      data: ['输入', '输出', '缓存', '总量'],
      textStyle: { color: '#475569', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 10,
      top: 0,
      right: 0
    },
    grid: { left: 0, right: 0, top: 28, bottom: 0, containLabel: false },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 10, margin: 4 }
    },
    yAxis: {
      type: 'value',
      splitLine: { show: false },
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '输入',
        type: 'bar',
        stack: 'total',
        data: promptData,
        itemStyle: { color: '#3b82f6' },
        barMaxWidth: 16
      },
      {
        name: '输出',
        type: 'bar',
        stack: 'total',
        data: completionData,
        itemStyle: { color: '#34d399' },
        barMaxWidth: 16
      },
      {
        name: '缓存',
        type: 'bar',
        stack: 'total',
        data: cachedData,
        itemStyle: { color: '#f59e0b', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 16
      },
      {
        name: '总量',
        type: 'line',
        data: totalData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: 'rgba(0,0,0,0.5)', borderColor: '#fff', borderWidth: 2 },
        lineStyle: { color: 'rgba(0,0,0,0.5)', width: 2 },
        z: 10
      }
    ]
  })
}

function initRedChart() {
  if (!redChartRef.value || !topUsers.value.length) return
  if (redChart) { redChart.dispose(); redChart = null }
  const el = redChartRef.value
  if (echarts.getInstanceByDom(el)) echarts.dispose(el)
  redChart = echarts.init(el)
  const names = topUsers.value.map(u => {
    return (usersMap.value['panel_' + u.userId] || u.display_name || u.name || 'N/A').slice(0, 8)
  })
  const values = topUsers.value.map(u => u.totalTokens)
  redChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
      textStyle: { color: '#1D2129', fontSize: 11 },
      formatter: (params) => {
        const idx = params[0]?.dataIndex
        const u = topUsers.value[idx]
        if (!u) return ''
        const dname = usersMap.value['panel_' + u.userId] || u.display_name || u.name
        return `<div style="font-weight:600;margin-bottom:4px">${dname}</div>
          <div style="line-height:1.8"><span style="color:#475569">请求数</span> <span style="float:right;margin-left:16px;font-weight:500">${(u.requestCount || 0).toLocaleString()}</span></div>
          <div style="line-height:1.8"><span style="color:#3b82f6">● 输入</span> <span style="float:right;margin-left:16px;font-weight:500">${fmtTokens(u.promptTokens)}</span></div>
          <div style="line-height:1.8"><span style="color:#34d399">● 输出</span> <span style="float:right;margin-left:16px;font-weight:500">${fmtTokens(u.completionTokens)}</span></div>
          <div style="line-height:1.8"><span style="color:#f59e0b">● 缓存</span> <span style="float:right;margin-left:16px;font-weight:500">${fmtTokens(u.cachedTokens)}</span></div>
          <div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:4px;padding-top:4px;font-weight:600">总量: ${fmtTokens(u.totalTokens)}</div>`
      }
    },
    grid: { left: 4, right: 56, top: 4, bottom: 4 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: values.map((v, i) => ({
        value: v,
        itemStyle: {
          color: i < 3 ? '#3b82f6' : 'rgba(59,130,246,0.35)',
          borderRadius: [0, 4, 4, 0]
        }
      })),
      barMaxWidth: 24,
      barCategoryGap: '10%'
    }]
  })
}

function initBlackChart() {
  if (!blackChartRef.value || !bottomUsers.value.length) return
  if (blackChart) { blackChart.dispose(); blackChart = null }
  const el = blackChartRef.value
  if (echarts.getInstanceByDom(el)) echarts.dispose(el)
  blackChart = echarts.init(el)
  const names = bottomUsers.value.map(u => {
    return (usersMap.value['panel_' + u.userId] || u.display_name || u.name || 'N/A').slice(0, 8)
  })
  const values = bottomUsers.value.map(u => u.totalTokens)
  blackChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
      textStyle: { color: '#1D2129', fontSize: 11 },
      formatter: (params) => {
        const idx = params[0]?.dataIndex
        const u = bottomUsers.value[idx]
        if (!u) return ''
        const dname = usersMap.value['panel_' + u.userId] || u.display_name || u.name
        return `<div style="font-weight:600;margin-bottom:4px">${dname}</div>
          <div style="line-height:1.8"><span style="color:#475569">请求数</span> <span style="float:right;margin-left:16px;font-weight:500">${(u.requestCount || 0).toLocaleString()}</span></div>
          <div style="line-height:1.8"><span style="color:#3b82f6">● 输入</span> <span style="float:right;margin-left:16px;font-weight:500">${fmtTokens(u.promptTokens)}</span></div>
          <div style="line-height:1.8"><span style="color:#34d399">● 输出</span> <span style="float:right;margin-left:16px;font-weight:500">${fmtTokens(u.completionTokens)}</span></div>
          <div style="line-height:1.8"><span style="color:#f59e0b">● 缓存</span> <span style="float:right;margin-left:16px;font-weight:500">${fmtTokens(u.cachedTokens)}</span></div>
          <div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:4px;padding-top:4px;font-weight:600">总量: ${fmtTokens(u.totalTokens)}</div>`
      }
    },
    grid: { left: 4, right: 56, top: 4, bottom: 4 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: values.map(v => ({
        value: v,
        itemStyle: { color: '#cbd5e1', borderRadius: [0, 4, 4, 0] }
      })),
      barMaxWidth: 24,
      barCategoryGap: '10%'
    }]
  })
}

function initDistChart() {
  if (!distChartRef.value) return
  if (distChart) { distChart.dispose(); distChart = null }
  const isProvider = distTab.value === 'provider'
  const items = isProvider ? providers.value : topModels.value
  if (!items.length) return
  const el = distChartRef.value
  if (echarts.getInstanceByDom(el)) echarts.dispose(el)
  distChart = echarts.init(el)
  const names = items.map(p => (p.name || '未分类').slice(0, 10))
  const values = items.map(p => p.requestCount)
  const color = isProvider ? '#3b82f6' : '#34d399'
  distChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
      textStyle: { color: '#1D2129', fontSize: 11 },
      formatter: (params) => {
        const i = params[0]?.dataIndex
        const item = items[i]
        if (!item) return ''
        return `<div style="font-weight:600">${item.name || '未分类'}</div><div style="margin-top:4px">请求数: <span style="font-weight:500">${fmt(item.requestCount)}</span></div>`
      }
    },
    grid: { left: 4, right: 56, top: 4, bottom: 4 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: values.map(v => ({
        value: v,
        itemStyle: { color, borderRadius: [0, 4, 4, 0] }
      })),
      barMaxWidth: 24,
      barCategoryGap: '10%'
    }]
  })
}

function switchDistTab(key) {
  distTab.value = key
  nextTick(() => initDistChart())
}

async function fetchStats(isUserSwitch = false) {
  topLoading.value = true
  try {
    const params = new URLSearchParams()
    // 1Panel usage/statistics 不支持时间参数，只透传 userId
    // 月份筛选在前端对返回的 trends 数据做本地过滤
    if (selectedUser.value) params.set('userId', String(selectedUser.value))
    const qs = params.toString()
    const url = `${API_BASE}/admin/usage-statistics${qs ? '?' + qs : ''}`
    const [statsRes, usersRes] = await Promise.all([
      fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } }),
      fetch(`${API_BASE}/admin/portal-users/map`, { headers: { Authorization: `Bearer ${getToken()}` } }),
    ])
    if (statsRes.ok) {
      const result = await statsRes.json()
      data.value = result
      if (!isUserSwitch || !globalData.value) {
        globalData.value = result
      }
      await nextTick()
      setTimeout(() => {
        initTrendChart()
        if (!isUserSwitch) {
          initRedChart()
          initBlackChart()
          initDistChart()
        }
      }, 100)
    } else if (statsRes.status === 502) {
      panelConfigured.value = false
      data.value = null
      globalData.value = null
    }
    if (usersRes.ok) {
      usersMap.value = await usersRes.json()
    }
  } catch (e) {
    console.error('获取统计失败:', e)
  } finally {
    topLoading.value = false
    loading.value = false
  }
}

function clearFilters() {
  selectedMonth.value = ''
  selectedUser.value = ''
  usernameFilter.value = ''
  userDropdownOpen.value = false
  fetchStats()
}

function clearUser() {
  selectedUser.value = ''
  usernameFilter.value = ''
  userDropdownOpen.value = false
  fetchStats(true)
}

function pickUser(u) {
  selectedUser.value = u.id
  usernameFilter.value = u.display_name
  userDropdownOpen.value = false
}

function selectFirstMatch() {
  const found = filteredUsers.value[0]
  if (found) pickUser(found)
  else userDropdownOpen.value = false
}

function onUserInput() {
  userDropdownOpen.value = true
  if (!usernameFilter.value.trim()) {
    selectedUser.value = ''
  }
}

function onGlobalClick(e) {
  if (!e.target.closest('.user-picker')) userDropdownOpen.value = false
}

watch([selectedUser, selectedMonth], () => {
  fetchStats(true)
})

const logout = () => { localStorage.removeItem('admin_token'); localStorage.removeItem('user'); router.push('/admin/login') }

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
  const token = getToken()
  if (!token) { router.push('/admin/login'); return }
  fetchStats()
})
onUnmounted(() => {
  document.removeEventListener('click', onGlobalClick)
  if (trendChart) { trendChart.dispose(); trendChart = null }
  if (redChart) { redChart.dispose(); redChart = null }
  if (blackChart) { blackChart.dispose(); blackChart = null }
  if (distChart) { distChart.dispose(); distChart = null }
})
</script>
