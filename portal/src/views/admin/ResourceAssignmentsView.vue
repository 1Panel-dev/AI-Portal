<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">资源组授权</h1>
        <p class="text-text-secondary text-sm mt-1">以资源组为单位管理用户授权。点击「管理成员」图标给组添加/移除授权用户；「预览」图标查看该组包含的资源</p>
      </div>
      <button
        @click="fetchGroups"
        :disabled="loading"
        class="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all disabled:opacity-50"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />刷新
      </button>
    </div>

    <!-- 搜索 -->
    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-4 flex items-center gap-3">
      <input
        v-model="keyword"
        class="flex-1 px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
        placeholder="搜索资源组名称..."
      />
      <span class="text-xs text-text-tertiary whitespace-nowrap">共 {{ filtered.length }} / {{ groups.length }} 个组</span>
    </div>

    <!-- 组列表 -->
    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.5fr_2fr_1fr_80px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>资源组</div><div>描述</div><div>已授权用户</div><div class="text-right">操作</div>
      </div>
      <div v-if="loading && !groups.length" class="py-20 text-center text-sm text-text-secondary">加载中...</div>
      <div v-else-if="!filtered.length" class="py-14 text-center text-sm text-text-secondary">暂无资源组，请先到「资源组管理」创建</div>
      <div
        v-for="g in paged"
        :key="g.id"
        class="grid grid-cols-[1.5fr_2fr_1fr_80px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm cursor-pointer hover:bg-black/[0.015]"
        @click="goManage(g.id)"
      >
        <div class="font-medium text-text truncate">{{ g.name }}</div>
        <div class="text-text-secondary truncate">{{ g.description || '-' }}</div>
        <div>
          <span class="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">{{ g.member_count ?? 0 }} 人</span>
        </div>
        <div class="flex items-center justify-end gap-1">
          <button class="p-2 text-text-secondary hover:text-accent transition-all" title="编辑授权" @click.stop="goManage(g.id)"><Pencil class="w-4 h-4" /></button>
          <button class="p-2 text-text-secondary hover:text-accent transition-all" title="预览组内资源" @click.stop="openPreview(g)"><Eye class="w-4 h-4" /></button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 text-sm text-text-secondary">
      <span>共 {{ filtered.length }} 个资源组</span>
      <div class="flex items-center gap-1.5">
        <button @click="page = 1" :disabled="page <= 1" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">«</button>
        <button @click="page--" :disabled="page <= 1" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">‹</button>
        <span class="px-2 text-text-secondary">{{ page }} / {{ totalPages }}</span>
        <button @click="page++" :disabled="page >= totalPages" class="h-9 px-2 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px]">›</button>
        <button @click="page = totalPages" :disabled="page >= totalPages" class="w-9 h-9 border border-[rgba(0,0,0,0.1)] rounded-lg disabled:opacity-30 hover:bg-surface-secondary text-[13px] font-medium">»</button>
      </div>
      <select v-model.number="pageSize" @change="page = 1" class="px-2.5 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-lg text-[13px] bg-white outline-none cursor-pointer">
        <option :value="10">10 条/页</option>
        <option :value="20">20 条/页</option>
        <option :value="50">50 条/页</option>
      </select>
    </div>

    <!-- 组内资源预览弹窗 -->
    <AppDialog :open="preview.open" :title="preview.title" size="lg" @close="closePreview">
      <!-- 成员选择器:选择成员后模型按「勾选∩该成员模型组」展示 -->
      <div v-if="preview.members.length" class="flex items-center gap-2 mb-4">
        <span class="text-xs text-text-tertiary whitespace-nowrap">查看成员可见资源</span>
        <select
          v-model="preview.selectedMemberId"
          @change="onPreviewMemberChange"
          class="flex-1 px-3 py-1.5 border border-[rgba(0,0,0,0.08)] rounded-lg text-xs bg-white outline-none focus:border-text"
        >
          <option v-for="m in preview.members" :key="m.id" :value="m.id">{{ m.name || m.username }}</option>
        </select>
      </div>
      <div v-else-if="!preview.loading" class="mb-4 text-xs text-text-tertiary">该组暂无成员，展示组内包含资源（模型未按成员模型组过滤）</div>
      <div v-if="preview.loading" class="py-10 text-center text-sm text-text-secondary">加载中...</div>
      <div v-else-if="preview.error" class="py-8 text-center text-sm text-red-500">{{ preview.error }}</div>
      <div v-else class="space-y-4">
        <div v-for="rt in previewTypes" :key="rt.key" class="border border-[rgba(0,0,0,0.06)] rounded-xl p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-text">{{ rt.name }}</span>
            <span class="text-xs text-text-tertiary">{{ (preview.data[rt.key] || []).length }} 个</span>
          </div>
          <div v-if="!(preview.data[rt.key] || []).length" class="text-xs text-text-tertiary py-2">未包含该类资源</div>
          <div v-else class="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
            <span
              v-for="(item, i) in preview.data[rt.key]"
              :key="i"
              class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600"
              :title="item.subtitle || ''"
            >{{ item.title }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <button @click="closePreview" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover">关闭</button>
      </template>
    </AppDialog>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, Eye, Pencil } from 'lucide-vue-next'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { showToast } from '../../composables/useToast.js'
import AppDialog from '../../components/AppDialog.vue'

const router = useRouter()
const getToken = () => getLoginToken()

const groups = ref([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return groups.value
  return groups.value.filter(g => (g.name || '').toLowerCase().includes(kw))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const paged = computed(() => {
  const p = Math.min(page.value, totalPages.value)
  const start = (p - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// 搜索变化时回到第一页
watch(keyword, () => { page.value = 1 })

function goManage(id) {
  router.push(`/admin/resource-assignments/${id}`)
}

async function fetchGroups() {
  loading.value = true
  try {
    const token = getToken()
    if (!token) { router.push('/admin/login'); return }
    const res = await fetch(`${API_BASE}/admin/groups`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取资源组失败'))
    groups.value = data.data || []
  } catch (err) {
    showToast(err.message || '获取资源组失败', 'error')
  } finally {
    loading.value = false
  }
}

// ---- 组内资源预览（按成员交集） ----
const previewTypes = [
  { key: 'model', name: '模型' },
  { key: 'skill', name: 'Skill' },
  { key: 'mcp', name: 'MCP' },
]
const preview = ref({ open: false, loading: false, error: '', title: '', data: {}, groupId: null, members: [], selectedMemberId: null })

async function fetchPreview(gId, userId) {
  const token = getToken()
  if (!token) { router.push('/admin/login'); return }
  const qs = userId ? `?userId=${userId}` : ''
  const res = await fetch(`${API_BASE}/admin/groups/${gId}/resources-preview${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errMsg(data, '获取预览失败'))
  return data.data || {}
}

async function openPreview(g) {
  preview.value = { open: true, loading: true, error: '', title: `组内资源 · ${g.name}`, data: {}, groupId: g.id, members: [], selectedMemberId: null }
  try {
    const token = getToken()
    if (!token) { router.push('/admin/login'); return }
    // 拉组详情拿成员列表
    const detailRes = await fetch(`${API_BASE}/admin/groups/${g.id}`, { headers: { Authorization: `Bearer ${token}` } })
    if (detailRes.status === 401 || detailRes.status === 403) { router.push('/admin/login'); return }
    const detailData = await detailRes.json().catch(() => ({}))
    const members = detailData.data?.members || []
    preview.value.members = members
    // 默认选第一个成员,按成员交集预览;无成员则展示组内资源
    const first = members[0]
    if (first) {
      preview.value.selectedMemberId = first.id
      preview.value.data = await fetchPreview(g.id, first.id)
    } else {
      preview.value.data = await fetchPreview(g.id)
    }
  } catch (err) {
    preview.value.error = err.message || '获取预览失败'
  } finally {
    preview.value.loading = false
  }
}

async function onPreviewMemberChange() {
  const gId = preview.value.groupId
  const uid = preview.value.selectedMemberId
  preview.value.loading = true
  preview.value.error = ''
  try {
    preview.value.data = uid ? await fetchPreview(gId, uid) : {}
  } catch (err) {
    preview.value.error = err.message || '获取预览失败'
  } finally {
    preview.value.loading = false
  }
}
function closePreview() {
  preview.value.open = false
}

onMounted(fetchGroups)
</script>
