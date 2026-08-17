<template>
  <div>
    <NavBar />

    <!-- Hero -->
    <section
      class="pb-12 text-center max-w-[720px] mx-auto animate-fade-up"
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
          class="w-full h-12 bg-white border border-[#d2d2d7] rounded-xl pl-11 pr-5 text-base text-text outline-none transition-all duration-200 placeholder:text-text-tertiary focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]"
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

    <!-- 筛选 Bar: 分类 + 排序 -->
    <FilterBar
      :total="total"
      :current-category="currentCategory"
      :sort-by="sortBy"
      @update:category="currentCategory = $event"
      @update:sort="sortBy = $event"
    />

    <!-- 无查看权限横幅 -->
    <div v-if="error" class="max-w-[1024px] mx-auto px-6 mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <div class="text-sm text-red-700">{{ error }}</div>
    </div>

    <!-- Skill Grid: min-height 固定容器高度,防止筛选切换时内容塌缩造成页面跳动 -->
    <div class="max-w-[1024px] mx-auto px-6 pb-20 min-h-[600px]">
      <SkillGrid
        :skills="skills"
        :loading="loading"
        @select="openDetail"
        @download="onDownload"
      />

      <LoadMore
        :has-more="hasMore"
        :total="total"
        @load-more="loadMore"
      />
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
import NavBar from '../components/NavBar.vue'
import FilterBar from '../components/FilterBar.vue'
import SkillGrid from '../components/SkillGrid.vue'
import LoadMore from '../components/LoadMore.vue'
import SkillDetailModal from '../components/SkillDetailModal.vue'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'
import { loadPermissions, can, isAdminRoleUser } from '../composables/usePermissions.js'

const router = useRouter()
const {
  skills, loading, error, stats, currentCategory, searchQuery,
  sortBy, total, hasMore, loadMore, recordDownload,
} = useSkills()

const selectedSkill = ref(null)
const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

const openDetail = (skill) => { selectedSkill.value = skill }
const onDownload = async (skillId) => { await recordDownload(skillId) }

// 深链直达预检：先加载权限再判断是否有 Skill 广场菜单权限(后台角色可看),无则跳首页
onMounted(async () => {
  await loadPermissions()
  if (!can('menu:skills') && !isAdminRoleUser.value) { router.replace('/') }
})
</script>
