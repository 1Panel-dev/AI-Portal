<template>
  <div>
    <!-- 简化顶栏（未登录页用，只 logo + 登录/注册） -->
    <SimpleHeader right="login" />

    <!-- 1. Hero（渐变光晕背景） -->
    <section class="relative overflow-hidden">
      <!-- 装饰渐变光晕 -->
      <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div class="absolute -top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(0,94,235,0.12),transparent_60%)]"></div>
        <div class="absolute top-40 -left-20 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(16,185,129,0.08),transparent_60%)]"></div>
        <div class="absolute top-32 -right-20 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(245,158,11,0.08),transparent_60%)]"></div>
      </div>
      <section
        class="relative pb-10 text-center max-w-[760px] mx-auto animate-fade-up"
        :class="hasVisibleBanner ? 'pt-[248px]' : 'pt-[208px]'"
      >
        <div class="inline-flex items-center gap-1.5 px-3 py-1 mb-6 rounded-full bg-[rgba(0,94,235,0.08)] text-accent text-[12px] font-medium">
          <Sparkles class="w-3.5 h-3.5" /> 面向 1Panel 生态的 AI 门户
        </div>
        <h1 class="text-[56px] font-bold text-text tracking-[-1.8px] leading-[1.05] mb-4 max-md:text-[42px] max-sm:text-[32px]">
          {{ siteName }}
        </h1>
        <p class="text-[20px] text-text-secondary font-normal mb-3 leading-relaxed">模型 · 技能 · MCP，一站式访问企业 AI 能力</p>
        <p class="text-[15px] text-text-tertiary mb-8 leading-relaxed max-w-[560px] mx-auto">对接 1Panel AI 网关，统一管理模型调用、技能市场与 MCP 生态，配以企业级资源组与角色权限</p>
        <div class="flex items-center justify-center gap-3">
          <router-link to="/login"
            class="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white text-[15px] font-medium rounded-xl hover:bg-accent-hover transition-all no-underline shadow-[0_8px_24px_rgba(0,94,235,0.25)]">
            开始使用 <ArrowRight class="w-4 h-4" />
          </router-link>
          <router-link to="/register"
            class="inline-flex items-center gap-2 px-6 py-3 bg-white text-text text-[15px] font-medium rounded-xl border border-[rgba(0,0,0,0.08)] hover:bg-surface-secondary transition-all no-underline">
            立即注册
          </router-link>
        </div>
      </section>

      <!-- 数据统计条 -->
      <section class="relative max-w-[860px] mx-auto px-6 pb-16">
        <div class="grid grid-cols-3 gap-4">
          <div v-for="s in stats" :key="s.label"
            class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-5 text-center shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
            <div class="text-[32px] font-bold text-text leading-none mb-1.5 tabular-nums">{{ s.value }}</div>
            <div class="text-[13px] text-text-secondary flex items-center justify-center gap-1.5">
              <component :is="s.icon" class="w-3.5 h-3.5 text-text-tertiary" /> {{ s.label }}
            </div>
          </div>
        </div>
      </section>
    </section>

    <!-- 2. 三个广场介绍 -->
    <section class="max-w-[1024px] mx-auto px-6 pb-20">
      <div class="text-center mb-10">
        <h2 class="text-[30px] font-bold text-text tracking-[-0.6px] mb-2">探索三大广场</h2>
        <p class="text-[15px] text-text-secondary">按需选用 AI 能力，快速接入业务</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <router-link v-for="p in plazas" :key="p.to" :to="p.to"
          class="group bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 no-underline hover:border-[rgba(0,94,235,0.3)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            :class="p.bg">
            <component :is="p.icon" class="w-6 h-6" :class="p.color" />
          </div>
          <h3 class="text-[18px] font-semibold text-text mb-1.5">{{ p.title }}</h3>
          <p class="text-[13px] text-text-secondary leading-relaxed mb-3">{{ p.desc }}</p>
          <div class="flex flex-wrap gap-1.5 mb-4">
            <span v-for="tag in p.tags" :key="tag" class="px-2 py-0.5 rounded-full text-[11px] bg-surface-secondary text-text-tertiary">{{ tag }}</span>
          </div>
          <span class="inline-flex items-center gap-1 text-[13px] text-accent font-medium group-hover:gap-2 transition-all">进入 <ArrowRight class="w-3.5 h-3.5" /></span>
        </router-link>
      </div>
    </section>

    <!-- 3. 核心特性 -->
    <section class="bg-white border-y border-[rgba(0,0,0,0.06)] py-20">
      <div class="max-w-[1024px] mx-auto px-6">
        <div class="text-center mb-12">
          <h2 class="text-[30px] font-bold text-text tracking-[-0.6px] mb-2">核心特性</h2>
          <p class="text-[15px] text-text-secondary">为企业 AI 落地而生</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div v-for="f in features" :key="f.title"
            class="group p-6 rounded-2xl border border-[rgba(0,0,0,0.06)] hover:border-[rgba(0,94,235,0.2)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.05)] transition-all">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
              :class="f.bg">
              <component :is="f.icon" class="w-5 h-5" :class="f.color" />
            </div>
            <h3 class="text-[16px] font-semibold text-text mb-1.5">{{ f.title }}</h3>
            <p class="text-[13px] text-text-secondary leading-relaxed">{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. 使用流程 -->
    <section class="max-w-[1024px] mx-auto px-6 py-20">
      <div class="text-center mb-12">
        <h2 class="text-[30px] font-bold text-text tracking-[-0.6px] mb-2">四步开始使用</h2>
        <p class="text-[15px] text-text-secondary">从注册到调用，简单几步</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
        <!-- 连接线（md+） -->
        <div class="hidden md:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-[rgba(0,94,235,0.2)] to-transparent"></div>
        <div v-for="(step, i) in steps" :key="step.title" class="relative text-center">
          <div class="relative inline-flex w-14 h-14 rounded-full bg-white border-2 border-[rgba(0,94,235,0.2)] items-center justify-center mb-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
            <component :is="step.icon" class="w-6 h-6 text-accent" />
            <span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center">{{ i + 1 }}</span>
          </div>
          <h3 class="text-[15px] font-semibold text-text mb-1">{{ step.title }}</h3>
          <p class="text-[12px] text-text-secondary leading-relaxed px-2">{{ step.desc }}</p>
        </div>
      </div>
    </section>

    <!-- 5. CTA 行动区 -->
    <section class="max-w-[1024px] mx-auto px-6 pb-20">
      <div class="relative overflow-hidden rounded-3xl px-8 py-14 text-center bg-gradient-to-br from-[rgba(0,94,235,0.95)] to-[rgba(0,58,150,0.95)] shadow-[0_12px_40px_rgba(0,94,235,0.25)]">
        <!-- 装饰光斑 -->
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div class="absolute -top-10 -right-10 w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>
          <div class="absolute -bottom-10 -left-10 w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>
        </div>
        <div class="relative">
          <h2 class="text-[28px] font-bold text-white mb-2 tracking-[-0.4px]">立即开始使用 {{ siteName }}</h2>
          <p class="text-[15px] text-white/80 mb-7">登录后即可申请 API Key，调用企业 AI 能力</p>
          <div class="flex items-center justify-center gap-3">
            <router-link to="/login"
              class="inline-flex items-center gap-2 px-6 py-3 bg-white text-accent text-[15px] font-semibold rounded-xl hover:bg-white/90 transition-all no-underline shadow-lg">
              登录 <ArrowRight class="w-4 h-4" />
            </router-link>
            <router-link to="/register"
              class="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white text-[15px] font-medium rounded-xl border border-white/30 hover:bg-white/20 transition-all no-underline backdrop-blur">
              立即注册
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. 底部品牌 -->
    <footer class="max-w-[1024px] mx-auto px-6 pb-16 text-center">
      <div class="border-t border-[rgba(0,0,0,0.06)] pt-8">
        <p class="text-[13px] text-text-tertiary">AI-Portal · 面向 1Panel 生态的 AI 门户与技能市场</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { Sun, Puzzle, LayoutGrid, ArrowRight, Sparkles, ShieldCheck, Users, RefreshCw, Boxes, KeyRound, Cpu } from 'lucide-vue-next'
import SimpleHeader from '../components/SimpleHeader.vue'
import { siteName } from '../composables/useSiteBranding.js'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'
import { API_BASE } from '../lib/apiBase.js'

const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

// 数据统计（懒加载，初始 -- 不卡首屏）
const modelCount = ref('--')
const skillCount = ref('--')
const mcpCount = ref('--')
const stats = computed(() => [
  { label: '可用模型', value: modelCount.value, icon: Sun },
  { label: '技能资源', value: skillCount.value, icon: Puzzle },
  { label: 'MCP 服务', value: mcpCount.value, icon: LayoutGrid },
])

const plazas = [
  { to: '/models', title: '模型广场', desc: '查找可调用的 AI 模型，复制模型名称与调用地址快速接入', icon: Sun, bg: 'bg-[rgba(0,94,235,0.08)]', color: 'text-accent', tags: ['对话', 'Embedding', '多模态'] },
  { to: '/skills', title: 'Skill 广场', desc: '浏览并安装技能，扩展 AI 能力，一站式技能市场', icon: Puzzle, bg: 'bg-[rgba(16,185,129,0.1)]', color: 'text-emerald-600', tags: ['审核上架', '一键安装'] },
  { to: '/mcp', title: 'MCP 广场', desc: '接入 MCP 服务，连接更多工具与数据源', icon: LayoutGrid, bg: 'bg-[rgba(245,158,11,0.1)]', color: 'text-amber-600', tags: ['工具连接', '数据源'] },
]

const features = [
  { title: '深度对接 1Panel', desc: '用户、模型、API Key 自动同步，1Panel AI 网关无缝衔接', icon: RefreshCw, bg: 'bg-[rgba(0,94,235,0.08)]', color: 'text-accent' },
  { title: '企业级权限', desc: '资源组 + 角色 RBAC，精细控制谁能用哪些模型与技能', icon: ShieldCheck, bg: 'bg-[rgba(16,185,129,0.1)]', color: 'text-emerald-600' },
  { title: '技能市场', desc: '技能提交、审核、上架、安装全流程管理', icon: Boxes, bg: 'bg-[rgba(245,158,11,0.1)]', color: 'text-amber-600' },
  { title: 'MCP 生态', desc: '接入 MCP 服务，连接工具与数据源，扩展 AI 边界', icon: Cpu, bg: 'bg-[rgba(139,92,246,0.1)]', color: 'text-violet-600' },
]

const steps = [
  { title: '登录 / 注册', desc: '账号登录或注册，对接 1Panel 用户体系', icon: Users },
  { title: '申请 API Key', desc: '在个人中心申请 API Key，对接 1Panel 网关', icon: KeyRound },
  { title: '选用模型 / 技能', desc: '在广场挑选模型、安装技能、接入 MCP', icon: Cpu },
  { title: '开始调用', desc: '复制调用地址与模型名，接入业务', icon: ArrowRight },
]

// 懒拉统计数字（失败保持 --，不报错）
// 三广场接口已改 verifyUser(需登录):未登录不拉,数字保持 --;登录用户带 token 拉各自可见资源的统计
onMounted(async () => {
  const token = localStorage.getItem('token') || localStorage.getItem('admin_token')
  if (!token) return
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const [modelsRes, skillsRes, mcpRes] = await Promise.allSettled([
      fetch(`${API_BASE}/models`, { headers }).then(r => r.json()),
      fetch(`${API_BASE}/skills?page=1&limit=1`, { headers }).then(r => r.json()),
      fetch(`${API_BASE}/mcp/search?page=1&pageSize=1`, { headers }).then(r => r.json()),
    ])
    if (modelsRes.status === 'fulfilled') {
      let n = 0
      for (const g of (modelsRes.value.groups || [])) n += (g.models || []).length
      modelCount.value = n
    }
    if (skillsRes.status === 'fulfilled') skillCount.value = skillsRes.value.pagination?.total ?? skillsRes.value.data?.length ?? '--'
    if (mcpRes.status === 'fulfilled') mcpCount.value = mcpRes.value.pagination?.total ?? mcpRes.value.data?.length ?? '--'
  } catch { /* 静默，保持 -- */ }
})
</script>
