import { ref, computed, onMounted, watch } from 'vue'

import { getLoginToken } from '../lib/apiBase'
// API 基础地址（与 useSkills.js 一致）
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

// 带 token:登录用户按资源组过滤;后端列表接口已改 verifyUser
const authHeaders = () => {
  const token = getLoginToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const servers = ref([])
const loading = ref(false)
const error = ref(null)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// 搜索防抖定时器
let searchDebounceTimer = null

// 请求版本号：每次新请求自增，用于丢弃过期响应
let requestSeq = 0

const searchQuery = ref('')

export function useMcpServers() {
  const loadServers = async (reset = false) => {
    if (reset) {
      currentPage.value = 1
      servers.value = []
    } else if (loading.value) {
      return
    }

    const mySeq = ++requestSeq
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      params.append('page', currentPage.value.toString())
      params.append('pageSize', pageSize.value.toString())
      if (searchQuery.value) {
        params.append('q', searchQuery.value)
      }

      const response = await fetch(`${API_BASE}/mcp/search?${params.toString()}`, { headers: authHeaders() })
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.reason || errBody.error || 'Failed to fetch MCP servers')
      }

      const result = await response.json()

      // 过期响应丢弃
      if (mySeq !== requestSeq) return

      servers.value = result.data
      total.value = result.pagination.total
    } catch (err) {
      if (mySeq === requestSeq) {
        console.error('Error loading MCP servers:', err)
        error.value = err.message
      }
    } finally {
      if (mySeq === requestSeq) {
        loading.value = false
      }
    }
  }

  // 防抖加载：立即显示骨架屏，避免空状态闪烁
  const debouncedLoad = (reset = true, delay = 300) => {
    if (reset) {
      servers.value = []
      loading.value = true
    }
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      loadServers(reset)
    }, delay)
  }

  // 翻页
  const goPage = (p) => {
    if (p < 1 || p > totalPages.value) return
    currentPage.value = p
    loadServers()
  }

  // 监听搜索输入
  watch(searchQuery, () => {
    debouncedLoad(true, 300)
  })

  // 初始加载
  onMounted(() => {
    loadServers(true)
  })

  return {
    servers,
    loading,
    error,
    searchQuery,
    total,
    currentPage,
    pageSize,
    totalPages,
    goPage,
    loadServers,
  }
}
