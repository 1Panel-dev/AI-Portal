<!-- 简化顶栏：未登录页面（落地页/登录/注册/管理员登录）用，只 logo + 右侧按钮 -->
<!-- 已登录页面用完整 NavBar -->
<script setup>
import { siteName, siteLogo, siteLogoIsDefault } from '../composables/useSiteBranding.js'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'
import { computed, ref } from 'vue'

const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)
// 已登录兜底（落地页 beforeEnter 已跳走，登录页登录后跳转，此处按钮按需显隐）
const isLoggedIn = ref(!!(localStorage.getItem('token') || localStorage.getItem('admin_token')))

// 落地页/登录页/注册页的右侧按钮差异化由 prop 控制
const props = defineProps({
  // right: 'login' (显登录+注册) | 'register' (显去登录) | 'plaza' (已登录显进入广场) | 'none'
  right: { type: String, default: 'login' },
})
</script>

<template>
  <nav
    class="fixed left-0 right-0 mx-auto max-w-[1910px] z-[260] h-[52px] border-b border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_10px_rgba(15,23,42,0.04)]"
    :class="hasVisibleBanner ? 'top-10' : 'top-0'"
  >
    <div class="px-6 h-full flex items-center justify-between">
      <router-link to="/" class="flex min-w-0 items-center text-[18px] text-text no-underline">
        <img v-if="siteLogoIsDefault"
          :src="siteLogo"
          alt="1Panel"
          class="h-[24px] w-[88px] mr-[8px] shrink-0 block object-contain object-left" />
        <div v-else class="h-[24px] flex shrink-0 items-center mr-[8px]">
          <img :src="siteLogo" alt="logo" class="h-full w-auto" />
        </div>
        <span class="min-w-0 truncate font-[900] [-webkit-text-stroke:0.5px_currentColor]">{{ siteName }}</span>
      </router-link>
      <div class="flex items-center gap-2">
        <!-- 落地页：未登录显 登录+注册；已登录兜底显进入广场 -->
        <template v-if="right === 'login'">
          <router-link v-if="!isLoggedIn" to="/login"
            class="px-4 py-1.5 text-[13px] bg-accent text-white rounded-lg hover:bg-accent-hover transition-all no-underline">
            登录
          </router-link>
          <router-link v-else to="/models"
            class="px-4 py-1.5 text-[13px] bg-accent text-white rounded-lg hover:bg-accent-hover transition-all no-underline">
            进入广场
          </router-link>
        </template>
        <!-- 注册页：显去登录 -->
        <template v-else-if="right === 'register'">
          <router-link to="/login"
            class="px-4 py-1.5 text-[13px] bg-accent text-white rounded-lg hover:bg-accent-hover transition-all no-underline">
            去登录
          </router-link>
        </template>
        <!-- 登录页：显去注册 -->
        <template v-else-if="right === 'login-page'">
          <router-link to="/register"
            class="px-4 py-1.5 text-[13px] text-text border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary transition-all no-underline">
            注册
          </router-link>
        </template>
        <!-- 管理员登录页：不显右侧按钮 -->
        <template v-else-if="right === 'none'"></template>
      </div>
    </div>
  </nav>
</template>
