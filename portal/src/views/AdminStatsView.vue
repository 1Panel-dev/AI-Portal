<template>
  <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">数据统计</h1>
          <p class="text-text-secondary text-sm mt-1">AI 使用情况全局概览</p>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">加载中...</div>

      <!-- Error / No 1Panel Config -->
      <div v-else-if="!panelConfigured" class="text-center py-20">
        <div class="text-4xl mb-4">⚙️</div>
        <p class="text-text-secondary mb-2">尚未配置 1Panel 网关</p>
        <p class="text-sm text-text-tertiary mb-4">请先在「系统配置」中填写 1Panel Base URL 和 API Key</p>
        <button v-if="can('system:config')" @click="$router.push('/admin/config')" class="px-4 py-2 text-sm btn-primary transition-all">前往配置</button>
      </div>

      <template v-else-if="globalData">
        <!-- 筛选栏 -->
        <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
          <span class="text-xs font-semibold text-text-secondary uppercase tracking-wide">筛选</span>
          <div class="h-5 w-px bg-[rgba(0,0,0,0.06)]"></div>
          <span class="text-xs text-text-secondary">时间</span>
          <div class="relative month-picker">
            <button @click="monthOpen = !monthOpen" class="flex items-center gap-1 px-2 py-1 text-xs border border-[rgba(0,0,0,0.08)] rounded-md bg-white h-7 hover:border-accent transition-colors">
              {{ monthLabel }}<span class="text-text-tertiary ml-0.5">▾</span>
            </button>
            <div v-if="monthOpen" class="absolute left-0 top-full mt-1 bg-white border border-[rgba(0,0,0,0.08)] rounded-lg shadow-lg z-30 max-h-[182px] overflow-y-auto">
              <div @click="selectedMonth = ''; monthOpen = false" class="px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-white transition-colors whitespace-nowrap" :class="{ 'bg-accent/10 text-accent font-medium': !selectedMonth }">全部月份</div>
              <div v-for="m in monthOptions" :key="m.value" @click="selectedMonth = m.value; monthOpen = false" class="px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-white transition-colors whitespace-nowrap" :class="{ 'bg-accent/10 text-accent font-medium': selectedMonth === m.value }">{{ m.label }}</div>
            </div>
          </div>
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
          <button v-if="selectedUser || usernameFilter || selectedMonth" @click="clearFilters" class="text-xs text-accent hover:underline shrink-0">清除筛选</button>
          <div class="flex-1"></div>
        </div>

        <!-- 顶部数据区 -->
        <div class="relative mb-4">
          <!-- 统计卡片 -->
          <div v-if="data" class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">总请求数</div>
              <div class="text-xl font-bold text-text">{{ fmt(displaySummary.requestCount) }}</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">总 Tokens</div>
              <div class="text-xl font-bold text-text">{{ fmtTokens(displaySummary.totalTokens) }}</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">失败请求</div>
              <div class="text-xl font-bold text-red-500">{{ fmt(displaySummary.failedRequests ?? 0) }}</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">失败率</div>
              <div class="text-xl font-bold" :class="failRate > 5 ? 'text-red-500' : 'text-text'">{{ failRate }}%</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">缓存命中率</div>
              <div class="text-xl font-bold text-emerald-600">{{ cacheHitRate }}%</div>
            </div>
            <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
              <div class="text-xs text-text-secondary mb-1">平均 Token/请求</div>
              <div class="text-xl font-bold text-text">{{ fmtTokens(displaySummary.averageTokens || avgTokensPerReq) }}</div>
            </div>
          </div>

          <!-- 趋势图 ECharts -->
          <div v-if="data" class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 col-span-2">
            <div class="text-sm font-semibold text-text mb-3">📈 用量趋势</div>
            <div v-if="trends.length" ref="trendChartRef" class="w-full" style="height:220px"></div>
            <div v-else class="h-[220px] flex items-center justify-center text-sm text-text-tertiary">暂无数据</div>
          </div>

          <!-- 顶部 loading 遮罩 -->
          <div v-if="topLoading" class="absolute inset-0 bg-white/70 z-10 flex items-center justify-center rounded-xl">
            <span class="text-sm text-text-secondary">加载中...</span>
          </div>
        </div>

        <!-- 用量 Top 10 / Bottom 10 -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-sm font-semibold text-text mb-3">用量 Top 10</div>
            <div v-if="selectedUser" class="text-xs text-accent mb-2">当前用户：{{ selectedUserName }}</div>
            <div ref="redChartRef" style="height:280px"></div>
          </div>
          <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div class="text-sm font-semibold text-text mb-3">用量 Bottom 10</div>
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
          <div v-if="distTab !== 'tokens'" ref="distChartRef" style="height:260px"></div>
          <div v-else class="space-y-3">
            <div>
              <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Prompt</span><span class="text-text-tertiary">{{ fmtTokens(data.summary?.promptTokens) }}</span></div>
              <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-accent rounded" :style="{ width: pct(data.summary?.promptTokens, data.summary?.totalTokens) + '%' }"></div></div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Completion</span><span class="text-text-tertiary">{{ fmtTokens(data.summary?.completionTokens) }}</span></div>
              <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-amber-500 rounded" :style="{ width: pct(data.summary?.completionTokens, data.summary?.totalTokens) + '%' }"></div></div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1"><span class="text-text-secondary">Cached</span><span class="text-text-tertiary">{{ fmtTokens(data.summary?.cachedTokens) }}</span></div>
              <div class="h-4 bg-surface-secondary rounded overflow-hidden"><div class="h-full bg-emerald-400 rounded" :style="{ width: pct(data.summary?.cachedTokens, data.summary?.totalTokens) + '%' }"></div></div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="text-center py-20 text-text-secondary">暂无数据</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

import { getLoginToken } from '../lib/apiBase'
import { can } from '../composables/usePermissions.js'
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
  { key: 'provider', label: '供应商' },
  { key: 'model', label: '模型' },
  { key: 'account', label: '账号' },
  { key: 'group', label: '用户组' },
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
// 默认选中当月(首次加载按当月范围请求 1Panel); 空串=全部月份
const currentMonthValue = monthOptions[0]?.value || ''
const selectedMonth = ref(currentMonthValue)
const monthOpen = ref(false)

// 北京月份 YYYY-MM -> 1Panel UTC ISO 时间范围
// startTime = 北京 m/1 00:00 -> UTC 前一天 16:00(浏览器 +8 时区 toISOString 自动换算)
// endTime   = 北京 (m+1)/1 00:00 -> UTC m 月末 16:00
function monthToRange(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  return {
    startTime: new Date(y, m - 1, 1).toISOString(),
    endTime: new Date(y, m, 1).toISOString(),
  }
}

const monthLabel = computed(() => {
  if (!selectedMonth.value) return '全部月份'
  const m = monthOptions.find(o => o.value === selectedMonth.value)
  return m ? m.label : selectedMonth.value
})

const summary = computed(() => data.value?.summary || {})
// 后端已按 selectedMonth 时间范围返回 trends, 前端不再本地过滤
const trends = computed(() => data.value?.trends || [])
// 选月份时后端按月范围请求 1Panel, summary 已是该月汇总, 无需本地累加
const displaySummary = computed(() => summary.value)

// 失败率 = 失败请求 / 总请求(>5% 红色高亮)
const failRate = computed(() => {
  const total = displaySummary.value?.requestCount || 0
  const failed = displaySummary.value?.failedRequests || 0
  if (!total) return '0.0'
  return ((failed / total) * 100).toFixed(1)
})
// 缓存命中率 = cachedTokens / totalTokens
const cacheHitRate = computed(() => {
  const total = displaySummary.value?.totalTokens || 0
  const cached = displaySummary.value?.cachedTokens || 0
  if (!total) return '0.0'
  return ((cached / total) * 100).toFixed(1)
})
// 平均 Token/请求 = totalTokens / requestCount
const avgTokensPerReq = computed(() => {
  const total = displaySummary.value?.totalTokens || 0
  const req = displaySummary.value?.requestCount || 0
  if (!req) return 0
  return Math.round(total / req)
})
const providers = computed(() => (data.value?.providers || []).filter(p => p.name && p.name.trim()))
const models = computed(() => (data.value?.models || []).filter(m => m.name && m.name.trim()).sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0)))
const accounts = computed(() => (data.value?.accounts || []).filter(a => a.name && a.name.trim()).sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0)))
const groups = computed(() => (data.value?.groups || []).filter(g => g.name && g.name.trim()).sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0)))

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

// topRank: 最近一次全局视角(descending)请求的 rankUsers(Top 10 降序), 钻取用户时不清空以维持红榜
const topRank = ref([])
// bottomRank: 单独一次 rankOrder=ascending 请求拿到的用量最少 10 个(已升序, 最少的在前)
const bottomRank = ref([])
// topUsers: Top 10 降序(1Panel 已排好序), 最高在前
const topUsers = computed(() => topRank.value)
// bottomUsers: 最少在下、往上递增 -> 升序数组 reverse 成[最多...最少], 配合 yAxis inverse:true
// (与红榜一致: 数组[0]在顶), 最多在顶、最少在底
const bottomUsers = computed(() => bottomRank.value.slice().reverse())

const getToken = () => getLoginToken()

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
const pct = (v, max) => Math.max(2, ((v || 0) / (max || 1)) * 100)

function initTrendChart() {
  if (!trendChartRef.value || !trends.value.length) return
  if (trendChart) { trendChart.dispose(); trendChart = null }
  trendChart = echarts.init(trendChartRef.value)
  const dates = trends.value.map(t => t.name)
  const promptData = trends.value.map(t => t.promptTokens)
  const completionData = trends.value.map(t => t.completionTokens)
  const cachedData = trends.value.map(t => t.cachedTokens)
  const totalData = trends.value.map(t => (t.promptTokens || 0) + (t.completionTokens || 0) + (t.cachedTokens || 0))
  const requestData = trends.value.map(t => t.requestCount || 0)

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
          if (p.seriesName === '总量' || p.seriesName === '请求数') return
          // 根据 seriesName 找对应的英文 key
          let colorKey = Object.keys(map).find(k => map[k] === p.seriesName)
          const color = colorKey ? colors[colorKey] : '#475569'
          html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.8"><span style="color:${color}">● ${p.seriesName}</span><span style="color:#1D2129;font-weight:500">${fmtTokens(p.value)}</span></div>`
        })
        const total = params.find(p => p.seriesName === '总量')
        if (total) html += `<div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:4px;padding-top:4px;font-weight:600;color:#1D2129">总量: ${fmtTokens(total.value)}</div>`
        const request = params.find(p => p.seriesName === '请求数')
        if (request) html += `<div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:4px;padding-top:4px;font-weight:600;color:#8b5cf4">请求数: ${fmtTokens(request.value)}</div>`
        return html
      }
    },
    legend: {
      data: [
        { name: '输入' },
        { name: '输出' },
        { name: '缓存' },
        { name: '总量' },
        { name: '请求数', icon: 'diamond', itemWidth: 12, itemHeight: 12 }
      ],
      textStyle: { color: '#475569', fontSize: 10 },
      itemWidth: 8,
      itemHeight: 8,
      top: 0,
      right: 0
    },
    grid: { left: 40, right: 38, top: 28, bottom: 0, containLabel: false },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 10, margin: 4 }
    },
    yAxis: [
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10, margin: 4, formatter: (v) => fmtTokens(v) },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10, margin: 4, formatter: (v) => v >= 1000 ? fmtTokens(v) : v },
        axisLine: { show: false },
        axisTick: { show: false }
      }
    ],
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
      },
      {
        name: '请求数',
        type: 'line',
        yAxisIndex: 1,
        data: requestData,
        smooth: true,
        symbol: 'diamond',
        symbolSize: 8,
        itemStyle: { color: '#8b5cf4', borderColor: '#fff', borderWidth: 2 },
        lineStyle: { color: '#8b5cf4', width: 2 },
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
  // 各维度取对应数据(已按 requestCount 降序), tokens 维度走单独的进度条渲染不进这里
  const itemsByTab = {
    provider: providers.value,
    model: topModels.value,
    account: accounts.value.slice(0, 10),
    group: groups.value.slice(0, 10),
  }
  const items = itemsByTab[distTab.value] || providers.value
  if (!items.length) return
  const el = distChartRef.value
  if (echarts.getInstanceByDom(el)) echarts.dispose(el)
  distChart = echarts.init(el)
  const isProvider = distTab.value === 'provider'
  const names = items.map(p => (p.name || '未分类').slice(0, 10))
  const values = items.map(p => p.requestCount)
  const colorMap = { provider: '#3b82f6', model: '#34d399', account: '#a855f7', group: '#f59e0b' }
  const color = colorMap[distTab.value] || '#3b82f6'
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

// 构造查询参数: 月份范围(选月份才带) + 排行分页(全局视角才带, 钻取单用户不带)
function buildStatsParams({ withRank = false, rankOrder = 'descending' } = {}) {
  const params = new URLSearchParams()
  if (selectedUser.value) params.set('userId', String(selectedUser.value))
  if (selectedMonth.value) {
    const { startTime, endTime } = monthToRange(selectedMonth.value)
    params.set('startTime', startTime)
    params.set('endTime', endTime)
  }
  if (withRank) {
    params.set('rankPage', '1')
    params.set('rankPageSize', '10')
    params.set('rankOrderBy', 'totalTokens')
    params.set('rankOrder', rankOrder)
  }
  return params.toString()
}

// 请求序号: 快速切月份/用户时, 丢弃晚到的过期响应, 防止竞态覆盖
let fetchSeq = 0

async function fetchStats(isUserSwitch = false) {
  const seq = ++fetchSeq
  topLoading.value = true
  try {
    // 钻取单用户时不带 rank(单用户无排行意义), 红黑榜维持上一次全局结果
    const withRank = !isUserSwitch
    const qs = buildStatsParams({ withRank, rankOrder: 'descending' })
    const url = `${API_BASE}/admin/usage-statistics${qs ? '?' + qs : ''}`
    // 并发发两个请求: 主(descending, 拿 data/趋势/分布/Top) + Bottom(ascending, 拿最少 10 个)
    const bottomFetch = withRank
      ? fetch(`${API_BASE}/admin/usage-statistics?${buildStatsParams({ withRank: true, rankOrder: 'ascending' })}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null)
    const [statsRes, bottomJson] = await Promise.all([fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } }), bottomFetch])
    // 过期响应丢弃: 用户在等待期间又切了筛选, 这次结果作废
    if (seq !== fetchSeq) return
    if (statsRes.ok) {
      const result = await statsRes.json()
      if (seq !== fetchSeq) return
      data.value = result
      if (!isUserSwitch || !globalData.value) {
        globalData.value = result
      }
      if (withRank) {
        topRank.value = (result.rankUsers || []).filter(u => u.name !== 'AIProxyUserFallback')
        if (bottomJson?.rankUsers) {
          bottomRank.value = bottomJson.rankUsers.filter(u => u.name !== 'AIProxyUserFallback')
        }
      }
      await nextTick()
      setTimeout(() => {
        if (seq !== fetchSeq) return
        initTrendChart()
        // 钻取用户时分布图也重绘(data 已切到该用户数据)
        initDistChart()
        if (!isUserSwitch) {
          initRedChart()
          initBlackChart()
        }
      }, 100)
    } else if (statsRes.status === 502) {
      panelConfigured.value = false
      data.value = null
      globalData.value = null
    }
  } catch (e) {
    console.error('获取统计失败:', e)
  } finally {
    if (seq === fetchSeq) {
      topLoading.value = false
      loading.value = false
    }
  }
}

// 用户映射表是静态数据, 只在进页面时拉一次, 不随筛选条件重拉
async function fetchUsersMap() {
  try {
    const res = await fetch(`${API_BASE}/admin/portal-users/map`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.ok) usersMap.value = await res.json()
    // 用户映射表后加载完成时, 若图表已渲染(中文名优先于英文), 重绘红黑榜保证显示中文名
    if (globalData.value && redChart) initRedChart()
    if (globalData.value && blackChart) initBlackChart()
  } catch (e) {
    console.error('获取用户映射失败:', e)
  }
}

function clearFilters() {
  selectedMonth.value = ''
  monthOpen.value = false
  selectedUser.value = ''
  usernameFilter.value = ''
  userDropdownOpen.value = false
  // 不再手动 fetchStats: 状态变更由 watch 统一触发(月份=本地重绘, 用户=重拉), 避免双发
}

function clearUser() {
  selectedUser.value = ''
  usernameFilter.value = ''
  userDropdownOpen.value = false
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
  if (!e.target.closest('.month-picker')) monthOpen.value = false
}

function onResize() {
  trendChart?.resize()
  redChart?.resize()
  blackChart?.resize()
  distChart?.resize()
}

watch(selectedUser, () => {
  fetchStats(true)
})

// 月份切换 -> 按月范围重拉 1Panel(卡片/趋势/分布/Top/Bottom 全部刷新为该月数据)
watch(selectedMonth, () => {
  fetchStats(false)
})

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
  window.addEventListener('resize', onResize)
  const token = getToken()
  if (!token) { router.push('/admin/login'); return }
  fetchStats()
  fetchUsersMap()
})
onUnmounted(() => {
  document.removeEventListener('click', onGlobalClick)
  window.removeEventListener('resize', onResize)
  if (trendChart) { trendChart.dispose(); trendChart = null }
  if (redChart) { redChart.dispose(); redChart = null }
  if (blackChart) { blackChart.dispose(); blackChart = null }
  if (distChart) { distChart.dispose(); distChart = null }
})
</script>
