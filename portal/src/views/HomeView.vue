<template>
  <div>
    <NavBar />

    <!-- Hero -->
    <section
      class="pb-8 text-center max-w-[720px] mx-auto animate-fade-up"
      :class="hasVisibleBanner ? 'pt-[248px]' : 'pt-[208px]'"
    >
      <h1 class="text-[52px] font-bold text-text tracking-[-1.6px] leading-[1.05] mb-3 max-md:text-[40px] max-sm:text-[32px]">
        查找可安装的 AI 技能
      </h1>
      <p class="text-[18px] text-text-secondary font-normal mb-8 leading-relaxed">
        查找适合的 Skill，一键复制安装指令，快速扩展你的 AI 能力
      </p>

      <!-- Search -->
      <div class="max-w-[520px] mx-auto mb-7 relative">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索技能..."
          class="w-full h-12 input-base rounded-xl pl-11 pr-5 text-base text-text outline-none transition-all duration-200 placeholder:text-text-tertiary focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]"
        >
      </div>

      <!-- Stats -->
      <div class="flex justify-center gap-10">
        <div class="text-center">
          <div class="text-2xl font-bold text-text tracking-[-0.5px]">{{ stats.totalSkills }}</div>
          <div class="text-xs text-text-secondary mt-0.5">技能</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-text tracking-[-0.5px]">{{ stats.totalDownloads }}</div>
          <div class="text-xs text-text-secondary mt-0.5">下载量</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-text tracking-[-0.5px]">{{ stats.uniqueAuthors }}</div>
          <div class="text-xs text-text-secondary mt-0.5">开发者</div>
        </div>
      </div>
    </section>

    <!-- 无查看权限横幅 -->
    <div v-if="error" class="max-w-[1024px] mx-auto px-6 mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <div class="text-sm text-red-700">{{ error }}</div>
    </div>

    <!-- 主内容区: 左侧标签栏 + 右侧网格 -->
    <div class="max-w-[1240px] mx-auto px-6 pb-20 flex gap-7 items-start">
      <!-- 左侧栏: 标签 -->
      <aside class="w-[208px] shrink-0 sticky top-[64px]">
        <div class="mb-6">
          <div class="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2.5 pl-3">标签</div>
          <div class="flex flex-col gap-0.5">
            <button @click="currentTag = ''" class="flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer select-none" :class="currentTag === '' ? 'bg-accent/8 text-accent font-medium' : 'text-text-secondary hover:bg-black/[0.03]'">
              <span>全部标签</span><span class="text-[11px] tabular-nums" :class="currentTag === '' ? 'text-accent/60' : 'text-text-tertiary'">{{ visibleSkillTotal }}</span>
            </button>
            <button v-for="t in tagsWithCount" :key="t.id" @click="currentTag = currentTag === t.id ? '' : t.id" class="flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer select-none" :class="currentTag === t.id ? 'bg-accent/8 text-accent font-medium' : 'text-text-secondary hover:bg-black/[0.03]'">
              <span class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>{{ t.name }}</span>
              <span class="text-[11px] tabular-nums" :class="currentTag === t.id ? 'text-accent/60' : 'text-text-tertiary'">{{ t.count }}</span>
            </button>
            <div v-if="!tagsWithCount.length" class="px-3 py-2 text-[12px] text-text-tertiary">暂无标签</div>
          </div>
        </div>
      </aside>

      <!-- 右侧主内容 -->
      <main class="flex-1 min-w-0">
        <!-- 顶部工具栏: 排序 + 结果数 -->
        <div class="flex items-center justify-between mb-5">
          <div class="text-[13px] text-text-secondary">
            共 <span class="font-semibold text-text">{{ total }}</span> 个结果
          </div>
          <div class="relative">
            <select
              v-model="sortBy"
              class="appearance-none px-4 py-2 pr-10 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg text-sm font-medium outline-none focus:border-accent/50 transition-all cursor-pointer"
            >
              <option v-for="s in sorts" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        <!-- 技能网格 -->
        <div class="min-h-[400px]">
          <SkillGrid
            :skills="skills"
            :loading="loading"
            @select="openDetail"
            @download="onDownload"
          />
        </div>

        <Pagination class="pt-6" :page="currentPage" :total-pages="totalPages" :total="total" @change="goPage" />
      </main>
    </div>

    <SkillDetailModal
      :skill="selectedSkill"
      :is-open="!!selectedSkill"
      @close="selectedSkill = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSkills } from '../composables/useSkills.js'
import Pagination from '../components/Pagination.vue'
import NavBar from '../components/NavBar.vue'
import SkillGrid from '../components/SkillGrid.vue'
import SkillDetailModal from '../components/SkillDetailModal.vue'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'
import { loadPermissions, can, isAdminRoleUser } from '../composables/usePermissions.js'
import { sorts } from '../data/categories.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const router = useRouter()
const {
  skills, loading, error, stats, currentCategory, currentTag, searchQuery,
  sortBy, total, currentPage, totalPages, goPage, recordDownload,
} = useSkills()

const selectedSkill = ref(null)
const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

// 标签列表(带 count) + 可见技能总数(来自 /api/skill-tags, 按用户资源权限过滤)
// 必须带 token: 不带会被 optionalUser 当访客 -> 全公开兜底返回全局统计,
// 与无权限用户空列表口径不一致(修复过一次的 bug)
const allTags = ref([])
const visibleSkillTotal = ref(0)
const fetchTags = async () => {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('admin_token') || ''
    const res = await fetch(`${API_BASE}/skill-tags`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (res.ok) {
      const body = await res.json()
      allTags.value = body.data || []
      visibleSkillTotal.value = body.total || 0
    }
  } catch (_) {}
}

const tagsWithCount = computed(() => {
  return allTags.value.filter(t => t.count > 0)
})

const openDetail = (skill) => { selectedSkill.value = skill }
const onDownload = async (skillId) => { await recordDownload(skillId) }

// 深链直达预检：先加载权限再判断是否有 Skill 广场菜单权限(后台角色可看),无则跳首页
onMounted(async () => {
  await loadPermissions()
  if (!can('menu:skills') && !isAdminRoleUser.value) { router.replace('/') }
  fetchTags()
})
</script>
