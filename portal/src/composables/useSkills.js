import { ref, computed, onMounted, watch } from 'vue'

// API 基础地址
const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const skills = ref([])
const loading = ref(false)
const error = ref(null)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(12)
const total = ref(0)
const hasMore = ref(false)

// 搜索防抖定时器
let searchDebounceTimer = null

// 请求版本号:每次新请求自增,用于丢弃过期响应(避免快速切换时旧请求覆盖新结果)
let requestSeq = 0

// 当前筛选状态
const currentCategory = ref('all')
const currentSource = ref('all')
const searchQuery = ref('')
const sortBy = ref('default')

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
      if (currentSource.value !== 'all') {
        params.append('source', currentSource.value)
      }
      if (searchQuery.value) {
        params.append('search', searchQuery.value)
      }
      if (sortBy.value !== 'default') {
        params.append('sort', sortBy.value)
      }

      const response = await fetch(`${API_BASE}/skills?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch skills')
      }

      const result = await response.json()

      // 过期响应丢弃: 在等响应期间用户又切了筛选,本次结果作废
      if (mySeq !== requestSeq) {
        return
      }

      if (reset || currentPage.value === 1) {
        skills.value = result.data
      } else {
        skills.value = [...skills.value, ...result.data]
      }

      total.value = result.pagination.total
      hasMore.value = result.pagination.hasMore
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

  // 加载更多
  const loadMore = async () => {
    if (!hasMore.value || loading.value) return
    currentPage.value++
    await loadSkills(false)
  }

  // 监听筛选条件变化
  watch([currentCategory, currentSource, sortBy], () => {
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
      const response = await fetch(`${API_BASE}/stats`)
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

  // 根据 slug 获取技能
  const getSkillBySlug = async (slug) => {
    // 先在当前列表中查找
    const cached = skills.value.find(s => s.slug === slug)
    if (cached) return cached

    // 从 API 获取
    try {
      const response = await fetch(`${API_BASE}/skills?slug=${encodeURIComponent(slug)}`)
      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      console.error('Error fetching skill:', err)
    }
    return null
  }

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
    currentSource,
    searchQuery,
    sortBy,
    total,
    hasMore,
    loadMore,
    getSkillBySlug,
    recordDownload,
    loadSkills,
  }
}
