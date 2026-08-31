<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">管理授权成员{{ group?.name ? ' · ' + group.name : '' }}</h1>
        <p class="text-text-secondary text-sm mt-1">管理该组的授权成员，或查看该组包含的资源</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="$router.push('/admin/resource-assignments')" class="px-4 py-2 text-sm btn-secondary transition-all">返回</button>
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
            class="flex items-center gap-2.5 px-3 py-2 border-b border-[rgba(0,0,0,0.04)] last:border-b-0 hover:bg-surface-secondary"
            :class="u.is_portal_admin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
            :title="u.is_portal_admin ? '超级管理员默认可见全部资源, 无需授权' : ''"
          >
            <input type="checkbox" :checked="leftChecked.has(u.id)" @change="toggleLeft(u.id)" :disabled="!!u.is_portal_admin" class="h-4 w-4 accent-accent disabled:opacity-40" />
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
          class="px-3 py-2 text-sm btn-primary disabled:opacity-40 transition-all whitespace-nowrap"
        >添加 ›</button>
        <button
          @click="moveLeft"
          :disabled="!rightChecked.size"
          class="px-3 py-2 text-sm btn-secondary disabled:opacity-40 transition-all whitespace-nowrap"
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
            class="flex items-center gap-2.5 px-3 py-2 border-b border-[rgba(0,0,0,0.04)] last:border-b-0 hover:bg-surface-secondary"
            :class="u.is_portal_admin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
            :title="u.is_portal_admin ? '超级管理员默认可见全部资源, 无需授权' : ''"
          >
            <input type="checkbox" :checked="rightChecked.has(u.id)" @change="toggleRight(u.id)" :disabled="!!u.is_portal_admin" class="h-4 w-4 accent-accent disabled:opacity-40" />
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
        v-if="can('group:assign')"
        @click="save"
        :disabled="saving || !dirty"
        class="px-5 py-2.5 text-sm btn-primary disabled:opacity-50 transition-all"
      >{{ saving ? '保存中...' : '保存授权' }}</button>
      <span v-if="!dirty" class="text-xs text-text-tertiary">未做修改</span>
      <span v-else class="text-xs text-amber-600">有未保存的修改</span>
    </div>
    </div><!-- /授权 tab -->

    <!-- ===== 资源预览 tab ===== -->
    <div v-if="activeTab === 'preview'">
      <!-- 模型可见性规则 tips -->
      <div class="flex items-start gap-2.5 px-4 py-3 mb-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl text-[13px] text-[#1e40af]">
        <Info class="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div class="leading-relaxed">
          <p class="font-medium mb-0.5">模型可见性规则</p>
          <p>成员实际可见的模型 = <span class="font-medium">资源组勾选的模型</span> ∩ <span class="font-medium">该成员在 1Panel 的模型授权</span>（由其 API Key 所属用户组 → 模型组推导）。技能 / MCP 不取交集，资源组勾选即对成员可见。未被任何资源组授权的成员无法看到该组的任何资源。</p>
        </div>
      </div>
      <!-- 成员限制概览表（一屏看全组成员的 1Panel 模型组限制） -->
      <div class="mb-4 border border-[rgba(0,0,0,0.06)] rounded-xl bg-white overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-2.5 border-b border-[rgba(0,0,0,0.04)] bg-surface-secondary flex-wrap">
          <span class="text-sm font-medium text-text">成员限制概览</span>
          <span class="text-[11px] text-text-tertiary">共 {{ membersOverview.total }} 人</span>
          <div class="flex-1 min-w-[140px] flex items-center gap-2 justify-end">
            <input v-model="overviewSearch" @input="onOverviewSearchInput" placeholder="搜索用户名/姓名..." class="w-44 px-2 py-1 border border-[rgba(0,0,0,0.08)] rounded text-xs bg-white outline-none focus:border-text" />
            <button @click="overviewOnlyBlocked = !overviewOnlyBlocked; fetchMembersOverview()" class="px-2 py-1 text-[11px] rounded border transition-colors" :class="overviewOnlyBlocked ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium' : 'border-[rgba(0,0,0,0.08)] text-text-secondary hover:text-text'">只看受限</button>
            <select v-model="overviewSort" class="px-1.5 py-1 border border-[rgba(0,0,0,0.08)] rounded text-[11px] bg-white outline-none">
              <option value="blocked">按被挡数</option>
              <option value="username">按用户名</option>
            </select>
          </div>
        </div>
        <div v-if="membersOverview.loading" class="py-8 text-center text-xs text-text-secondary">加载中...</div>
        <div v-else-if="membersOverview.error" class="py-8 text-center text-xs text-red-500">{{ membersOverview.error }}</div>
        <div v-else-if="!sortedOverviewRows.length" class="py-8 text-center text-xs text-text-tertiary">{{ overviewSearch || overviewOnlyBlocked ? '无匹配成员' : '暂无成员' }}</div>
        <div v-else class="max-h-[360px] overflow-y-auto">
          <div v-for="m in sortedOverviewRows" :key="m.userId" class="border-b border-[rgba(0,0,0,0.03)] last:border-b-0">
            <div class="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-surface-secondary/60 transition-colors" @click="toggleExpandMember(m.userId)">
              <span class="w-32 shrink-0 truncate text-[13px] text-text">{{ m.name || m.username }}</span>
              <span class="w-24 shrink-0 truncate text-[11px] text-text-tertiary">{{ m.username }}</span>
              <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium" :class="m.isPortalAdmin || m.isAdminRole ? 'bg-sky-50 text-sky-600' : (m.panelGroupName ? 'bg-slate-100 text-slate-600' : 'bg-surface-secondary text-text-tertiary')">
                {{ m.isPortalAdmin ? '超管' : (m.isAdminRole ? '后台角色' : (m.panelGroupName || '无1Panel组')) }}
              </span>
              <span class="shrink-0 text-[11px] tabular-nums" :class="m.blockedCount > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'">
                {{ m.visibleCount }}/{{ m.total }}
              </span>
              <span v-if="m.blockedCount > 0" class="shrink-0 text-[11px] text-amber-600 font-medium">⚠ 挡 {{ m.blockedCount }}</span>
              <span v-else class="shrink-0 text-[11px] text-emerald-600">✓</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ml-auto shrink-0 text-text-tertiary transition-transform" :class="expandedMemberId === m.userId ? 'rotate-90' : ''"><path d="m9 18 6-6-6-6"/></svg>
            </div>
            <div v-if="expandedMemberId === m.userId" class="px-4 pb-3 pt-1 bg-amber-50/20">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <p class="text-[11px] text-emerald-600 mb-1.5">✓ 可见 ({{ m.visibleModels.length }})</p>
                  <div v-if="m.visibleModels.length" class="flex flex-wrap gap-1.5">
                    <span v-for="name in m.visibleModels" :key="name" class="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600">{{ name }}</span>
                  </div>
                  <p v-else class="text-[11px] text-text-tertiary">无</p>
                </div>
                <div>
                  <p class="text-[11px] text-amber-600 mb-1.5">⚠ 被挡 ({{ m.blockedModels.length }})</p>
                  <div v-if="m.blockedModels.length" class="flex flex-wrap gap-1.5">
                    <span v-for="name in m.blockedModels" :key="name" class="px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200/60">{{ name }}</span>
                  </div>
                  <p v-else class="text-[11px] text-text-tertiary">无</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="preview.loading" class="py-14 text-center text-sm text-text-secondary bg-white border border-[rgba(0,0,0,0.06)] rounded-xl">加载中...</div>
      <div v-else-if="preview.error" class="py-12 text-center text-sm text-red-500 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl">{{ preview.error }}</div>
      <div v-else class="space-y-4">
        <p class="text-xs text-text-tertiary">该资源组当前包含的资源：</p>
        <!-- 模型：拆分可见/被挡 -->
        <div class="border border-[rgba(0,0,0,0.06)] rounded-xl p-4 bg-white">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-text">模型</span>
            <span class="text-xs text-text-tertiary">
              {{ (preview.data.model || []).length }} 个可见
              <template v-if="preview.data.model_filtered">
                <span class="text-amber-500 mx-0.5">·</span>勾选 {{ (preview.data.model || []).length + (preview.data.model_blocked || []).length }}，挡 {{ (preview.data.model_blocked || []).length }}
              </template>
            </span>
          </div>
          <div v-if="(preview.data.model || []).length" class="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
            <span v-for="(item, i) in preview.data.model" :key="i" class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600" :title="item.subtitle || ''">{{ item.title }}</span>
          </div>
          <div v-else class="text-xs text-text-tertiary py-2">无可见模型</div>
          <template v-if="preview.data.model_filtered && (preview.data.model_blocked || []).length">
            <div class="mt-3 pt-2 border-t border-[rgba(0,0,0,0.04)]">
              <p class="text-[11px] text-amber-600 font-medium mb-1.5">⚠ 被 1Panel 模型组挡住 ({{ (preview.data.model_blocked || []).length }})</p>
              <div class="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
                <span v-for="(item, i) in preview.data.model_blocked" :key="i" class="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200/60" :title="item.subtitle || ''">{{ item.title }}</span>
              </div>
            </div>
          </template>
        </div>
        <!-- Skill -->
        <div class="border border-[rgba(0,0,0,0.06)] rounded-xl p-4 bg-white">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-text">Skill</span>
            <span class="text-xs text-text-tertiary">{{ (preview.data.skill || []).length }} 个</span>
          </div>
          <div v-if="!(preview.data.skill || []).length" class="text-xs text-text-tertiary py-2">未包含该类资源</div>
          <div v-else class="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
            <span v-for="(item, i) in preview.data.skill" :key="i" class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600" :title="item.subtitle || ''">{{ item.title }}</span>
          </div>
        </div>
        <!-- MCP -->
        <div class="border border-[rgba(0,0,0,0.06)] rounded-xl p-4 bg-white">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-text">MCP</span>
            <span class="text-xs text-text-tertiary">{{ (preview.data.mcp || []).length }} 个</span>
          </div>
          <div v-if="!(preview.data.mcp || []).length" class="text-xs text-text-tertiary py-2">未包含该类资源</div>
          <div v-else class="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
            <span v-for="(item, i) in preview.data.mcp" :key="i" class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600" :title="item.subtitle || ''">{{ item.title }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Info } from 'lucide-vue-next'
import { API_BASE, getLoginToken, errMsg } from '../../lib/apiBase'
import { can, loadPermissions } from '../../composables/usePermissions.js'
import { showToast } from '../../composables/useToast.js'

const route = useRoute()
const router = useRouter()
const getToken = () => getLoginToken()
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
  if (key === 'preview') {
    selectedPreviewMember.value = null
    blockedModelIds.value = new Set()
    memberHint.value = ''
    expandedMemberId.value = null
    if (!membersOverview.value.loaded) fetchMembersOverview()
    fetchPreview()
  }
}

// 初始授权用户 id 集合（用于判断 dirty）
const initialRightIds = ref(new Set())

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
// 全选只统计可选行(超管置灰不可授权)
const selectableLeft = computed(() => filteredLeft.value.filter(u => !u.is_portal_admin))
const selectableRight = computed(() => filteredRight.value.filter(u => !u.is_portal_admin))
const leftAllChecked = computed(() => selectableLeft.value.length > 0 && selectableLeft.value.every(u => leftChecked.value.has(u.id)))
const rightAllChecked = computed(() => selectableRight.value.length > 0 && selectableRight.value.every(u => rightChecked.value.has(u.id)))

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
  if (leftAllChecked.value) for (const u of selectableLeft.value) s.delete(u.id)
  else for (const u of selectableLeft.value) s.add(u.id)
  leftChecked.value = s
}
function toggleAllRight() {
  const s = new Set(rightChecked.value)
  if (rightAllChecked.value) for (const u of selectableRight.value) s.delete(u.id)
  else for (const u of selectableRight.value) s.add(u.id)
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
    if (!res.ok) throw new Error(errMsg(data, '获取详情失败'))
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

// 先取第 1 页拿 total, 再并发拉剩余页(原串行翻页, 用户多时是 N/100 次串行 RTT)
async function fetchAllUsersPaged(token) {
  const pageSize = 100
  const fetchPage = async (p) => {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    const res = await fetch(`${API_BASE}/admin/portal-users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return { items: [], total: 0 } }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取用户失败'))
    return { items: data.items || [], total: data.total || 0 }
  }
  const first = await fetchPage(1)
  const totalPages = Math.min(Math.ceil(first.total / pageSize), 50)
  if (totalPages <= 1) return first.items
  const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2)))
  return [first, ...rest].flatMap(r => r.items)
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
    if (!res.ok) throw new Error(errMsg(data, '保存失败'))
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
const preview = ref({ loading: false, error: '', data: {}, loaded: false })
const selectedPreviewMember = ref(null)
const blockedModelIds = ref(new Set())
const memberHint = ref('')

// ---- 成员限制概览（一屏看全组成员的 1Panel 模型组限制）----
const membersOverview = ref({ loading: false, error: '', rows: [], total: 0, loaded: false })
const overviewSearch = ref('')
const overviewOnlyBlocked = ref(false)
const overviewSort = ref('blocked')  // blocked | username
const expandedMemberId = ref(null)  // 展开看被挡明细的成员 id
let overviewSearchTimer = null

async function fetchMembersOverview() {
  membersOverview.value = { ...membersOverview.value, loading: true, error: '' }
  try {
    const token = getToken()
    const params = new URLSearchParams()
    if (overviewSearch.value.trim()) params.set('q', overviewSearch.value.trim())
    if (overviewOnlyBlocked.value) params.set('onlyBlocked', 'true')
    const qs = params.toString() ? '?' + params.toString() : ''
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}/members-preview${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取成员概览失败'))
    membersOverview.value = {
      loading: false, error: '',
      rows: data.data?.members || [],
      total: data.data?.total || 0,
      loaded: true,
    }
  } catch (err) {
    membersOverview.value = { loading: false, error: err.message || '获取成员概览失败', rows: [], total: 0, loaded: true }
  }
}

function onOverviewSearchInput() {
  // 防抖: 输入停 350ms 再请求
  if (overviewSearchTimer) clearTimeout(overviewSearchTimer)
  overviewSearchTimer = setTimeout(fetchMembersOverview, 350)
}

// 排序后的展示行
const sortedOverviewRows = computed(() => {
  const rows = [...membersOverview.value.rows]
  if (overviewSort.value === 'blocked') {
    rows.sort((a, b) => b.blockedCount - a.blockedCount || (a.username || '').localeCompare(b.username || ''))
  } else {
    rows.sort((a, b) => (a.username || '').localeCompare(b.username || ''))
  }
  return rows
})

function toggleExpandMember(userId) {
  expandedMemberId.value = expandedMemberId.value === userId ? null : userId
}

async function fetchPreview(memberId) {
  preview.value = { loading: true, error: '', data: {}, loaded: false }
  try {
    const token = getToken()
    const uid = memberId || selectedPreviewMember.value
    const qs = uid ? `?userId=${uid}` : ''
    const res = await fetch(`${API_BASE}/admin/groups/${groupId}/resources-preview${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errMsg(data, '获取预览失败'))
    const d = data.data || {}
    preview.value = { loading: false, error: '', data: d, loaded: true }
    blockedModelIds.value = new Set((d.model_blocked || []).map(r => String(r.id)))
    memberHint.value = d.memberHint || ''
  } catch (err) {
    preview.value = { loading: false, error: err.message || '获取预览失败', data: {}, loaded: true }
    blockedModelIds.value = new Set()
    memberHint.value = ''
  }
}
async function onPreviewMemberChange() {
  if (selectedPreviewMember.value) await fetchPreview(selectedPreviewMember.value)
  else await fetchPreview()
}

onMounted(() => {
  loadPermissions()
  fetchGroupDetail()
  fetchAllUsers()
})
</script>
