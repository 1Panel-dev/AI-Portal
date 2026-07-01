<template>
  <nav
    class="fixed left-0 right-0 z-[260] h-[52px] border-b border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_10px_rgba(15,23,42,0.04)]"
    :class="hasVisibleBanner ? 'top-10' : 'top-0'"
  >
    <div class="max-w-[1024px] mx-auto px-6 h-full flex items-center">
      <router-link to="/" class="flex items-center text-[18px] tracking-[-0.45px] text-text no-underline">
        <!-- 默认 logo 直接渲染 SVG 图片,避免小尺寸 mask 栅格化后边缘发虚。 -->
        <img v-if="siteLogoIsDefault"
          :src="siteLogo"
          alt="1Panel"
          class="h-[24px] w-[88px] mr-[8px] shrink-0 block object-contain object-left" />
        <div v-else class="h-[24px] flex items-center mr-[8px]">
          <img :src="siteLogo" alt="logo" class="h-full w-auto" />
        </div>
      {{ siteName }}
      </router-link>

      <div class="flex items-center gap-1 ml-6">
        <router-link to="/"
          class="px-3 py-1.5 text-[14px] text-text rounded-lg transition-colors hover:bg-black/5 no-underline"
          :class="isActive('/') ? 'font-semibold text-text' : 'text-text-secondary'">
          模型广场
        </router-link>
        <router-link to="/skills"
          class="px-3 py-1.5 text-[14px] text-text rounded-lg transition-colors hover:bg-black/5 no-underline"
          :class="isActive('/skills') ? 'font-semibold text-text' : 'text-text-secondary'">
          Skill 广场
        </router-link>
        <router-link to="/mcp"
          class="px-3 py-1.5 text-[14px] text-text rounded-lg transition-colors hover:bg-black/5 no-underline"
          :class="isActive('/mcp') ? 'font-semibold text-text' : 'text-text-secondary'">
          MCP 广场
        </router-link>

      </div>

      <div class="flex items-center gap-1 ml-auto">
        <router-link to="/docs"
          class="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-text-secondary rounded-lg transition-colors hover:bg-black/5 hover:text-text no-underline">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          在线文档
        </router-link>
        <!-- User Dropdown (logged in) -->
        <div v-if="isLoggedIn" class="relative">
          <button @click="showDropdown = !showDropdown"
            class="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-text rounded-lg transition-colors hover:bg-black/5">
            <div class="w-6 h-6 bg-text rounded-full flex items-center justify-center">
              <span class="text-[10px] text-white font-medium">{{ userInitial }}</span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              class="transition-transform" :class="{ 'rotate-180': showDropdown }">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="showDropdown"
            class="absolute right-0 top-full mt-2 w-[160px] bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-card-hover py-1 z-[265]">
            <!-- 管理员菜单 -->
            <template v-if="isAdmin">
              <router-link to="/admin" @click="showDropdown = false"
                class="flex items-center gap-2 px-4 py-2.5 text-sm text-text hover:bg-black/5 no-underline transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                管理后台
              </router-link>
            </template>
            <!-- 普通用户菜单 -->
            <template v-else>
              <router-link to="/profile" @click="showDropdown = false"
                class="flex items-center gap-2 px-4 py-2.5 text-sm text-text hover:bg-black/5 no-underline transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                个人中心
              </router-link>
              <router-link to="/profile?tab=api-keys" @click="showDropdown = false"
                class="flex items-center gap-2 px-4 py-2.5 text-sm text-text hover:bg-black/5 no-underline transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              API Key 管理
            </router-link>
            </template>
            <div class="my-1 border-t border-[rgba(0,0,0,0.06)]"></div>
            <button @click="logout"
              class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              退出登录
            </button>
          </div>
        </div>

        <!-- Login button (not logged in) -->
        <router-link v-else to="/login"
          class="ml-2 px-4 py-1.5 text-[13px] bg-accent text-white rounded-lg hover:bg-accent-hover transition-all no-underline">
          登录
        </router-link>
      </div>
    </div>
  </nav>
  <div v-if="showDropdown" class="fixed inset-0 z-[250]" @click="showDropdown = false"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { siteName, siteLogo, siteLogoIsDefault } from '../composables/useSiteBranding.js'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const showDropdown = ref(false)
const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

const isActive = (path) => {
  if (path === '/') {
    return route.path === '/' || route.path === '/models' || route.query.redirect === '/' || route.query.redirect?.startsWith('/models')
  }
  if (path === '/skills') {
    return route.path === '/skills' || route.path.startsWith('/skill') || route.query.redirect === '/skills'
  }
  if (path === '/mcp') {
    return route.path === '/mcp'
  }
  if (path === '/docs') {
    return route.path === '/docs'
  }
  return route.path === path
}

const isLoggedIn = computed(() => !!localStorage.getItem('token') || !!localStorage.getItem('admin_token'))
const isAdmin = computed(() => !!localStorage.getItem('admin_token'))
const userInitial = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return (user.name || user.username || 'U').charAt(0).toUpperCase()
  } catch { return 'U' }
})

const logout = () => {
  showDropdown.value = false
  localStorage.removeItem('token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('user')
  router.push('/login')
}

const handleKeydown = (e) => { if (e.key === 'Escape') showDropdown.value = false }
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>
