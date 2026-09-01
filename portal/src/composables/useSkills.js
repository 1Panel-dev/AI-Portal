import { ref, computed, onMounted, watch } from 'vue'

import { getLoginToken } from '../lib/apiBase'
// API 基础地址
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

// 带 token:登录用户按资源组过滤;后端列表接口已改 verifyUser
const authHeaders = () => {
  const token = getLoginToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const skills = ref([])
const loading = ref(false)
const error = ref(null)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// 搜索防抖定时器
let searchDebounceTimer = null

// 请求版本号:每次新请求自增,用于丢弃过期响应(避免快速切换时旧请求覆盖新结果)
let requestSeq = 0

// 当前筛选状态
const currentCategory = ref('all')
const currentTag = ref('')
const searchQuery = ref('')
const sortBy = ref('default')

// 根据 slug 获取技能（模块级导出: 详情页直接用, 不必调用 useSkills() ——
// 否则会连带触发 composable 里的 onMounted, 在详情页白打 /skills 列表 + /stats 两个请求）
export async function getSkillBySlug(slug) {
  // 先在当前列表中查找
  const cached = skills.value.find(s => s.slug === slug)
  if (cached) return cached

  // 从 API 获取
  try {
    const response = await fetch(`${API_BASE}/skills?slug=${encodeURIComponent(slug)}`, { headers: authHeaders() })
    if (response.ok) {
      return await response.json()
    }
  } catch (err) {
    console.error('Error fetching skill:', err)
  }
  return null
}

export function useSkills() {
  // 加载技能数据（分页）
  // reset=true: 切换筛选条件,需要丢弃旧结果重新查; 即使有 in-flight 请求也要继续——
  //            否则筛选切换后界面会卡住(skills 清空,但因 loading 守卫吞掉新请求)
  // reset=false: 加载更多,如果已在加载就跳过,避免重复追加
  const loadSkills = async (reset = false) => {
    if (reset) {
      currentPage.value = 1
      skills.value = []
    } else if (loading.value) {
      return
    }

    const mySeq = ++requestSeq
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      params.append('page', currentPage.value.toString())
      params.append('limit', pageSize.value.toString())

      if (currentCategory.value !== 'all') {
        params.append('category', currentCategory.value)
      }
      if (searchQuery.value) {
        params.append('search', searchQuery.value)
      }
      if (sortBy.value !== 'default') {
        params.append('sort', sortBy.value)
      }
      if (currentTag.value) {
        params.append('tag', currentTag.value)
      }

      const response = await fetch(`${API_BASE}/skills?${params.toString()}`, { headers: authHeaders() })
      if (!response.ok) {
        // 403 = 无 skill:view 查看权限,读后端 error 文案展示给用户
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.error || 'Failed to fetch skills')
      }

      const result = await response.json()

      // 过期响应丢弃: 在等响应期间用户又切了筛选,本次结果作废
      if (mySeq !== requestSeq) {
        return
      }

      skills.value = result.data
      total.value = result.pagination.total
    } catch (err) {
      if (mySeq === requestSeq) {
        console.error('Error loading skills:', err)
        error.value = err.message
      }
    } finally {
      // 只有最新请求才负责清 loading,避免老请求 finally 把新请求的 loading 置 false
      if (mySeq === requestSeq) {
        loading.value = false
      }
    }
  }

  // 防抖加载: 切换筛选条件时立即标记 loading,让 SkillGrid 显示骨架屏而非"暂无匹配"
  // 否则 100ms 防抖窗口内 skills=[] 且 loading=false → 闪现"暂无匹配技能"
  const debouncedLoad = (reset = true, delay = 300) => {
    if (reset) {
      // 立即把 skills 清空 + loading 置 true,骨架屏立即显示,无闪烁空状态
      skills.value = []
      loading.value = true
    }
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      loadSkills(reset)
    }, delay)
  }

  // 翻页
  const goPage = (p) => {
    if (p < 1 || p > totalPages.value) return
    currentPage.value = p
    loadSkills()
  }

  // 监听筛选条件变化
  watch([currentCategory, sortBy, currentTag], () => {
    debouncedLoad(true, 100)
  })

  watch(searchQuery, () => {
    debouncedLoad(true, 300)
  })

  // 初始加载
  onMounted(() => {
    loadSkills(true)
  })

  // 统计数据
  const stats = ref({
    totalSkills: 0,
    totalDownloads: '0',
    uniqueAuthors: 0,
  })

  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`, { headers: authHeaders() })
      if (response.ok) {
        const data = await response.json()
        stats.value = {
          totalSkills: data.totalSkills,
          totalDownloads: data.totalDownloads > 10000
            ? `${(data.totalDownloads / 10000).toFixed(1)}万`
            : data.totalDownloads.toString(),
          uniqueAuthors: data.uniqueAuthors,
        }
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  onMounted(loadStats)

  // Track download requests
  const downloadInProgress = new Set()
  const downloadCooldown = new Map()

  // Record download
  const recordDownload = async (id) => {
    const now = Date.now()
    const lastDownload = downloadCooldown.get(id)

    if (lastDownload && now - lastDownload < 5000) return null
    if (downloadInProgress.has(id)) return null

    downloadInProgress.add(id)

    try {
      const response = await fetch(`${API_BASE}/skills/${id}/download`, {
        method: 'POST',
      })

      if (response.status === 429) {
        downloadCooldown.set(id, now)
        return null
      }

      if (response.ok) {
        const data = await response.json()
        downloadCooldown.set(id, now)

        // 更新本地数据
        const skill = skills.value.find(s => s.id === id)
        if (skill) {
          skill.downloads = data.downloads
        }
        return data.downloads
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error recording download:', err)
      }
    } finally {
      downloadInProgress.delete(id)
    }
    return null
  }

  return {
    skills,
    loading,
    error,
    stats,
    currentCategory,
    currentTag,
    searchQuery,
    sortBy,
    total,
    currentPage,
    pageSize,
    totalPages,
    goPage,
    getSkillBySlug,
    recordDownload,
    loadSkills,
  }
}
