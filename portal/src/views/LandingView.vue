<template>
  <div>
    <NavBar />

    <!-- Hero -->
    <section
      class="pb-12 text-center max-w-[720px] mx-auto animate-fade-up"
      :class="hasVisibleBanner ? 'pt-[248px]' : 'pt-[208px]'"
    >
      <h1 class="text-[52px] font-bold text-text tracking-[-1.6px] leading-[1.05] mb-3 max-md:text-[40px] max-sm:text-[32px]">
        {{ siteName }}
      </h1>
      <p class="text-[18px] text-text-secondary font-normal mb-3 leading-relaxed">1Panel AI 门户</p>
      <p class="text-[15px] text-text-tertiary mb-8 leading-relaxed">模型 · 技能 · MCP，一站式访问企业 AI 能力</p>
      <div class="flex items-center justify-center gap-3">
        <router-link to="/login"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-[14px] font-medium rounded-xl hover:bg-accent-hover transition-all no-underline shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          登录
        </router-link>
        <router-link to="/register"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-text text-[14px] font-medium rounded-xl border border-[rgba(0,0,0,0.08)] hover:bg-surface-secondary transition-all no-underline">
          立即注册
        </router-link>
      </div>
    </section>

    <!-- 3 个广场介绍卡 -->
    <section class="max-w-[1024px] mx-auto px-6 pb-20">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <router-link v-for="p in plazas" :key="p.to" :to="p.to"
          class="group bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 no-underline hover:border-[rgba(0,94,235,0.3)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
            :class="p.bg">
            <component :is="p.icon" class="w-5 h-5" :class="p.color" />
          </div>
          <h3 class="text-[17px] font-semibold text-text mb-1.5">{{ p.title }}</h3>
          <p class="text-[13px] text-text-secondary leading-relaxed mb-3">{{ p.desc }}</p>
          <span class="text-[13px] text-accent group-hover:underline">进入 -></span>
        </router-link>
      </div>
    </section>

    <!-- 底部品牌 -->
    <footer class="max-w-[1024px] mx-auto px-6 pb-16 text-center">
      <div class="border-t border-[rgba(0,0,0,0.06)] pt-8">
        <p class="text-[13px] text-text-tertiary">AI-Portal · 面向 1Panel 生态的 AI 门户与技能市场</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import NavBar from '../components/NavBar.vue'
import { Sun, Puzzle, LayoutGrid } from 'lucide-vue-next'
import { siteName } from '../composables/useSiteBranding.js'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'

const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

const plazas = [
  { to: '/models', title: '模型广场', desc: '查找可调用的 AI 模型，复制模型名称与调用地址快速接入', icon: Sun, bg: 'bg-[rgba(0,94,235,0.08)]', color: 'text-accent' },
  { to: '/skills', title: 'Skill 广场', desc: '浏览并安装技能，扩展 AI 能力', icon: Puzzle, bg: 'bg-[rgba(16,185,129,0.1)]', color: 'text-emerald-600' },
  { to: '/mcp', title: 'MCP 广场', desc: '接入 MCP 服务，连接更多工具与数据源', icon: LayoutGrid, bg: 'bg-[rgba(245,158,11,0.1)]', color: 'text-amber-600' },
]
</script>
