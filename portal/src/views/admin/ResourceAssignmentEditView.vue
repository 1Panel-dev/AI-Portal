<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">管理授权成员{{ group?.name ? ' · ' + group.name : '' }}</h1>
        <p class="text-text-secondary text-sm mt-1">管理该组的授权成员，或查看该组包含的资源</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="$router.push('/admin/resource-assignments')" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all">返回</button>
      </div>
    </div>

    <!-- 主 tab -->
    <div class="flex gap-1 border-b border-[rgba(0,0,0,0.06)] mb-6">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="px-4 py-2.5 text-sm cursor-pointer border-b-2 transition-all"
        :class="activeTab === t.key ? 'text-accent border-accent font-semibold' : 'text-text-secondary border-transparent hover:text-text'"
        @click="switchTab(t.key)"
      >{{ t.label }}</div>
    </div>

    <!-- ===== 授权 tab ===== -->
    <div v-if="activeTab === 'assign'">
    <!-- 穿梭框 -->
    <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
      <!-- 左：所有用户（未授权的） -->
      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-semibold text-text">所有用户</h2>
          <span class="text-xs text-text-tertiary">{{ leftChecked.size }}/{{ leftList.length }}</span>
        </div>
        <input
          v-model="leftKeyword"
          class="w-full px-3 py-2 mb-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
          placeholder="搜索用户名或姓名..."
        />
        <div v-if="userLoading" class="py-10 text-center text-sm text-text-secondary">加载中...</div>
        <div v-else class="border border-[rgba(0,0,0,0.06)] rounded-lg max-h-[420px] overflow-y-auto">
          <label class="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,0,0,0.04)] text-xs text-text-secondary bg-surface-secondary cursor-pointer">
            <input type="checkbox" :checked="leftAllChecked" @change="toggleAllLeft" class="h-4 w-4 accent-accent" />全选
          </label>
          <label
            v-for="u in filteredLeft"
            :key="u.id"
            class="flex items-center gap-2.5 px-3 py-2 border-b border-[rgba(0,0,0,0.04)] last:border-b-0 cursor-pointer hover:bg-surface-secondary"
          >
            <input type="checkbox" :checked="leftChecked.has(u.id)" @change="toggleLeft(u.id)" class="h-4 w-4 accent-accent" />
            <div class="flex-1 min-w-0">
              <div class="text-[13px] text-text truncate">{{ u.name || u.username }} <span class="text-text-tertiary font-normal text-xs">· {{ u.username }}</span></div>
            </div>
            <span v-if="u.is_portal_admin" class="text-[10px] text-accent">超管</span>
          </label>
          <div v-if="!filteredLeft.length" class="py-6 text-center text-xs text-text-tertiary">无匹配用户</div>
        </div>
      </div>

      <!-- 中间操作 -->
      <div class="flex flex-col gap-2 pt-16">
        <button
          @click="moveRight"
          :disabled="!leftChecked.size"
          class="px-3 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-all whitespace-nowrap"
        >添加 ›</button>
        <button
          @click="moveLeft"
          :disabled="!rightChecked.size"
          class="px-3 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary disabled:opacity-40 transition-all whitespace-nowrap"
        >‹ 移除</button>
      </div>

      <!-- 右：已授权用户 -->
      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-semibold text-text">已授权用户</h2>
          <span class="text-xs text-text-tertiary">{{ rightChecked.size }}/{{ rightList.length }}</span>
        </div>
        <input
          v-model="rightKeyword"
          class="w-full px-3 py-2 mb-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm outline-none focus:border-text bg-surface-secondary"
          placeholder="搜索用户名或姓名..."
        />
        <div class="border border-[rgba(0,0,0,0.06)] rounded-lg max-h-[420px] overflow-y-auto">
          <label class="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,0,0,0.04)] text-xs text-text-secondary bg-surface-secondary cursor-pointer">
            <input type="checkbox" :checked="rightAllChecked" @change="toggleAllRight" class="h-4 w-4 accent-accent" />全选
          </label>
          <label
            v-for="u in filteredRight"
            :key="u.id"
            class="flex items-center gap-2.5 px-3 py-2 border-b border-[rgba(0,0,0,0.04)] last:border-b-0 cursor-pointer hover:bg-surface-secondary"
          >
            <input type="checkbox" :checked="rightChecked.has(u.id)" @change="toggleRight(u.id)" class="h-4 w-4 accent-accent" />
            <div class="flex-1 min-w-0">
              <div class="text-[13px] text-text truncate">{{ u.name || u.username }} <span class="text-text-tertiary font-normal text-xs">· {{ u.username }}</span></div>
            </div>
            <span v-if="u.is_portal_admin" class="text-[10px] text-accent">超管</span>
          </label>
          <div v-if="!filteredRight.length" class="py-6 text-center text-xs text-text-tertiary">暂无授权用户</div>
        </div>
      </div>
    </div>

    <!-- 保存按钮 -->
    <div class="flex items-center gap-3 mt-6">
      <button
        @click="save"
        :disabled="saving || !dirty"
        class="px-5 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-all"
      >{{ saving ? '保存中...' : '保存授权' }}</button>
      <span v-if="!dirty" class="text-xs text-text-tertiary">未做修改</span>
      <span v-else class="text-xs text-amber-600">有未保存的修改</span>
    </div>
    </div><!-- /授权 tab -->

    <!-- ===== 资源预览 tab ===== -->
    <div v-if="activeTab === 'preview'">
      <div v-if="preview.loading" class="py-14 text-center text-sm text-text-secondary bg-white border border-[rgba(0,0,0,0.06)] rounded-xl">加载中...</div>
      <div v-else-if="preview.error" class="py-12 text-center text-sm text-red-500 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl">{{ preview.error }}</div>
      <div v-else class="space-y-4">
        <!-- 模型可见性规则 tips -->
        <div class="flex items-start gap-2.5 px-4 py-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl text-[13px] text-[#1e40af]">
          <Info class="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div class="leading-relaxed">
            <p class="font-medium mb-0.5">模型可见性规则</p>
            <p>成员实际可见的模型 = <span class="font-medium">资源组勾选的模型</span> ∩ <span class="font-medium">该成员在 1Panel 的模型授权</span>（由其 API Key 所属用户组 → 模型组推导）。技能 / MCP 不取交集，资源组勾选即对成员可见。未被任何资源组授权的用户走全公开兜底（看全部）。</p>
          </div>
        </div>
        <p class="text-xs text-text-tertiary">该资源组当前包含的资源：</p>
        <div v-for="rt in previewTypes" :key="rt.key" class="border border-[rgba(0,0,0,0.06)] rounded-xl p-4 bg-white">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-text">{{ rt.name }}</span>
            <span class="text-xs text-text-tertiary">{{ (preview.data[rt.key] || []).length }} 个</span>
          </div>
          <div v-if="!(preview.data[rt.key] || []).length" class="text-xs text-text-tertiary py-2">未包含该类资源</div>
          <div v-else class="flex flex-wrap gap-1.5 max-h-[260px] overflow-y-auto">
            <span
              v-for="(item, i) in preview.data[rt.key]"
              :key="i"
              class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600"
              :title="item.subtitle || ''"
            >{{ item.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Teleport to="body">
      <div v-if="toast.show" class="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-fade-up" :class="toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'" @click="toast.show = false">
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Info } from 'lucide-vue-next'
import { API_BASE } from '../../lib/apiBase'

const route = useRoute()
const router = useRouter()
const getToken = () => localStorage.getItem('admin_token')
const groupId = Number(route.params.id)

const group = ref(null)
const userLoading = ref(true)

// 穿梭框状态：leftList = 未授权候选，rightList = 已授权。初始 rightList 来自组详情，leftList = 全量 - rightList
const allUsers = ref([])
const rightList = ref([])  // 已授权用户对象数组
const leftChecked = ref(new Set())   // 左栏勾选的 id（待添加）
const rightChecked = ref(new Set())  // 右栏勾选的 id（待移除）
const leftKeyword = ref('')
const rightKeyword = ref('')
const saving = ref(false)

// 主 tab：授权 / 资源预览
const tabs = [
  { key: 'assign', label: '授权' },
  { key: 'preview', label: '资源预览' },
]
const activeTab = ref('assign')
function switchTab(key) {
  activeTab.value = key
  // 切到资源预览且未加载过时拉取
  if (key === 'preview' && !preview.value.loaded && !preview.value.loading) {
    fetchPreview()
  }
}

// 初始授权用户 id 集合（用于判断 dirty）
const initialRightIds = ref(new Set())

const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

const rightIds = computed(() => new Set(rightList.value.map(u => u.id)))
const leftList = computed(() => allUsers.value.filter(u => !rightIds.value.has(u.id)))

const filteredLeft = computed(() => {
  const kw = leftKeyword.value.trim().toLowerCase()
  if (!kw) return leftList.value
  return leftList.value.filter(u => (u.username || '').toLowerCase().includes(kw) || (u.name || '').toLowerCase().includes(kw))
})
const filteredRight = computed(() => {
  const kw = rightKeyword.value.trim().toLowerCase()
  if (!kw) return rightList.value
  return rightList.value.filter(u => (u.username || '').toLowerCase().includes(kw) || (u.name || '').toLowerCase().includes(kw))
})
const leftAllChecked = computed(() => filteredLeft.value.length > 0 && filteredLeft.value.every(u => leftChecked.value.has(u.id)))
const rightAllChecked = computed(() => filteredRight.value.length > 0 && filteredRight.value.every(u => rightChecked.value.has(u.id)))

const dirty = computed(() => {
  const cur = new Set(rightList.value.map(u => u.id))
  if (cur.size !== initialRightIds.value.size) return true
  for (const id of cur) if (!initialRightIds.value.has(id)) return true
  return false
})

function toggleLeft(id) {
  const s = new Set(leftChecked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  leftChecked.value = s
}
function toggleRight(id) {
  const s = new Set(rightChecked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  rightChecked.value = s
}
function toggleAllLeft() {
  const s = new Set(leftChecked.value)
  if (leftAllChecked.value) for (const u of filteredLeft.value) s.delete(u.id)
  else for (const u of filteredLeft.value) s.add(u.id)
  leftChecked.value = s
}
function toggleAllRight() {
  const s = new Set(rightChecked.value)
  if (rightAllChecked.value) for (const u of filteredRight.value) s.delete(u.id)
  else for (const u of filteredRight.value) s.add(u.id)
  rightChecked.value = s
}

// 添加：左栏勾选的移到右栏
function moveRight() {
  if (!leftChecked.value.size) return
  const toAdd = leftList.value.filter(u => leftChecked.value.has(u.id))
  rightList.value = [...rightList.value, ...toAdd]
  leftChecked.value = new Set()
}
// 移除：右栏勾选的移回左栏
function moveLeft() {
  if (!rightChecked.value.size) return
  rightList.value = rightList.value.filter(u => !rightChecked.value.has(u.id))
  rightChecked.value = new Set()
}

async function fetchGroupDetail() {
  try {
    const token = getToken()
    if (!token) { router.push('/admin/login'); return }
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
    if (res.status === 404) { showToast('资源组不存在', 'error'); router.push('/admin/resource-assignments'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取详情失败')
    group.value = data.data
    rightList.value = data.data?.members || []
    initialRightIds.value = new Set(rightList.value.map(u => u.id))
  } catch (err) {
    showToast(err.message || '获取详情失败', 'error')
  }
}

async function fetchAllUsers() {
  userLoading.value = true
  try {
    const token = getToken()
    if (!token) { router.push('/admin/login'); return }
    allUsers.value = await fetchAllUsersPaged(token)
  } catch (err) {
    showToast(err.message || '获取用户失败', 'error')
  } finally {
    userLoading.value = false
  }
}

async function fetchAllUsersPaged(token) {
  const list = []
  let p = 1
  const pageSize = 100
  while (true) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    const res = await fetch(`${API_BASE}/admin/portal-users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return list }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取用户失败')
    list.push(...(data.items || []))
    const total = data.total || 0
    if (list.length >= total || (data.items || []).length < pageSize) break
    p++
    if (p > 50) break
  }
  return list
}

async function save() {
  saving.value = true
  try {
    const token = getToken()
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}/members`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: rightList.value.map(u => u.id) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.reason || '保存失败')
    initialRightIds.value = new Set(rightList.value.map(u => u.id))
    showToast('授权已保存，已切换到「资源预览」', 'success')
    switchTab('preview')
  } catch (err) {
    showToast(err.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

// ---- 资源预览（资源预览 tab 内容）----
const previewTypes = [
  { key: 'model', name: '模型' },
  { key: 'skill', name: 'Skill' },
  { key: 'mcp', name: 'MCP' },
]
const preview = ref({ loading: false, error: '', data: {}, loaded: false })

async function fetchPreview() {
  preview.value = { loading: true, error: '', data: {}, loaded: false }
  try {
    const token = getToken()
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}/resources-preview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '获取预览失败')
    preview.value = { loading: false, error: '', data: data.data || {}, loaded: true }
  } catch (err) {
    preview.value = { loading: false, error: err.message || '获取预览失败', data: {}, loaded: true }
  }
}

onMounted(() => {
  fetchGroupDetail()
  fetchAllUsers()
})
onUnmounted(() => { if (toastTimer) clearTimeout(toastTimer) })
</script>
