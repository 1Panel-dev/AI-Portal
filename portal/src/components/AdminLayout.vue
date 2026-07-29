<template>
  <div class="flex h-screen">
    <!-- Sidebar：全高，贯穿顶到底 -->
    <aside
      class="flex-shrink-0 flex flex-col bg-white border-r border-[rgba(0,0,0,0.05)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
      :style="{ width: collapsed ? '64px' : '240px' }"
    >
      <!-- 顶部：Logo + 折叠按钮（固定不滚，与右侧顶栏等高对齐） -->
      <div
        class="flex-shrink-0 h-[52px] flex items-center border-b border-[rgba(0,0,0,0.04)]"
        :class="collapsed ? 'justify-center px-0' : 'px-4'"
      >
        <router-link
          to="/admin"
          class="flex items-center min-w-0 text-text no-underline"
          :class="collapsed ? 'justify-center' : ''"
          :title="collapsed ? siteName : undefined"
        >
          <img
            v-if="siteLogoIsDefault"
            :src="siteLogo"
            alt="1Panel"
            class="shrink-0 block object-contain object-left"
            :class="collapsed ? 'h-[22px] w-[22px]' : 'h-[24px] w-[88px] mr-[8px]'"
          />
          <div v-else class="flex shrink-0 items-center" :class="collapsed ? 'h-[24px]' : 'h-[24px] mr-[8px]'">
            <img :src="siteLogo" alt="logo" class="h-full w-auto" :class="collapsed ? 'max-w-[24px]' : ''" />
          </div>
          <span
            v-if="!collapsed"
            class="min-w-0 truncate text-[16px] font-[900] [-webkit-text-stroke:0.5px_currentColor]"
          >{{ siteName }}</span>
        </router-link>
      </div>

      <!-- Menu items（自身滚动） -->
      <nav class="flex-1 overflow-y-auto pt-6 pb-4 px-3 space-y-5" :class="collapsed ? 'px-1.5' : ''">
        <!-- 概览 -->
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">概览</p>
          <div class="space-y-0.5">
            <SideItem v-if="can('user:view')" to="/admin/stats" :active="isActive('/admin/stats')" :collapsed="collapsed" title="数据统计">
              <BarChart3 class="w-5 h-5" /><template #label>数据统计</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>

        <!-- 内容管理 -->
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">内容管理</p>
          <div class="space-y-0.5">
            <SideItem v-if="can('skill:edit')" to="/admin" :active="isActive('/admin')" :collapsed="collapsed" title="审核管理">
              <ClipboardCheck class="w-5 h-5" /><template #label>审核管理</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>

        <!-- 资源管理（资源组排第一） -->
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">资源管理</p>
          <div class="space-y-0.5">
            <SideItem v-if="can('group:view')" to="/admin/groups" :active="isActive('/admin/groups')" :collapsed="collapsed" title="资源组管理">
              <FolderKanban class="w-5 h-5" /><template #label>资源组管理</template>
            </SideItem>
            <SideItem v-if="can('skill:view')" to="/admin/skills" :active="isActive('/admin/skills')" :collapsed="collapsed" title="技能管理">
              <Puzzle class="w-5 h-5" /><template #label>技能管理</template>
            </SideItem>
            <SideItem v-if="can('mcp:view')" to="/admin/mcps" :active="isActive('/admin/mcps')" :collapsed="collapsed" title="MCP 管理">
              <LayoutGrid class="w-5 h-5" /><template #label>MCP 管理</template>
            </SideItem>
            <SideItem v-if="can('model:view')" to="/admin/models" :active="isActive('/admin/models')" :collapsed="collapsed" title="模型管理">
              <Sun class="w-5 h-5" /><template #label>模型管理</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>

        <!-- 用户与权限 -->
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">用户与权限</p>
          <div class="space-y-0.5">
            <SideItem v-if="can('user:view')" to="/admin/users" :active="isActive('/admin/users')" :collapsed="collapsed" title="用户管理">
              <UserCog class="w-5 h-5" /><template #label>用户管理</template>
            </SideItem>
            <SideItem v-if="can('role:view')" to="/admin/roles" :active="isActive('/admin/roles')" :collapsed="collapsed" title="角色权限">
              <ShieldCheck class="w-5 h-5" /><template #label>角色权限</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>

        <!-- 系统设置 -->
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">系统设置</p>
          <div class="space-y-0.5">
            <SideItem v-if="can('system:config')" to="/admin/config" :active="isActive('/admin/config')" :collapsed="collapsed" title="系统配置">
              <Sliders class="w-5 h-5" /><template #label>系统配置</template>
            </SideItem>
            <SideItem v-if="can('system:config')" to="/admin/oauth" :active="isActive('/admin/oauth')" :collapsed="collapsed" title="第三方登录">
              <KeyRound class="w-5 h-5" /><template #label>第三方登录</template>
            </SideItem>
            <SideItem v-if="can('group:view')" to="/admin/panel-groups" :active="isActive('/admin/panel-groups')" :collapsed="collapsed" title="1Panel 授权信息">
              <Boxes class="w-5 h-5" /><template #label>1Panel 授权信息</template>
            </SideItem>
          </div>
        </section>
      </nav>

      <!-- 底部：版本标 + 折叠按钮（展开态）；折叠态只放展开按钮 -->
      <div class="flex-shrink-0 px-3 pb-4 pt-1" :class="collapsed ? 'flex justify-center' : ''">
        <div
          class="flex items-center rounded-xl bg-[rgba(0,0,0,0.02)]"
          :class="collapsed ? 'justify-center w-10 h-10' : 'px-3.5 py-3'"
        >
          <p v-if="!collapsed" class="flex-1 min-w-0 text-[10px] text-text-tertiary leading-relaxed">
            AI-Portal <span class="opacity-30 mx-1">·</span> <span class="font-semibold text-text-secondary">v1.0.3</span>
          </p>
          <button
            @click="collapsed = !collapsed"
            class="group flex items-center justify-center rounded-lg text-text-tertiary hover:text-text hover:bg-[rgba(0,0,0,0.06)] transition-all duration-150"
            :class="collapsed ? 'w-8 h-8' : 'w-6 h-6 ml-2 shrink-0'"
            :title="collapsed ? '展开菜单' : '收起菜单'"
          >
            <PanelLeftOpen v-if="collapsed" class="w-4 h-4 group-hover:scale-110 transition-transform" />
            <PanelLeftClose v-else class="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>
    </aside>

    <!-- 右列：顶栏 + 内容区（独立滚动） -->
    <div class="flex-1 flex flex-col min-w-0">
      <AdminTopBar />
      <main class="flex-1 overflow-y-auto">
        <div v-if="permsReady" class="px-10 py-8">
          <router-view />
        </div>
        <div v-else class="px-10 py-8 text-text-tertiary text-sm">加载中…</div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTopBar from './admin/AdminTopBar.vue'
import SideItem from './admin/SideItem.vue'
import { siteName, siteLogo, siteLogoIsDefault } from '../composables/useSiteBranding.js'
import { bannerVisible } from '../composables/useAnnouncement.js'
import { loadPermissions, permissions, isPortalAdmin, can } from '../composables/usePermissions.js'
import { BarChart3, ClipboardCheck, Puzzle, UserCog, Sliders, KeyRound, PanelLeftClose, PanelLeftOpen, FolderKanban, LayoutGrid, Sun, ShieldCheck, Boxes } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const permsReady = ref(false)

function isActive(path) {
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}

// 进入后台时隐藏顶部公告横幅（避免遮挡后台顶栏），离开时恢复原状态
let savedBannerVisible = null
onMounted(async () => {
  savedBannerVisible = bannerVisible.value
  bannerVisible.value = false
  await loadPermissions()
  // 既非超管又无任何管理类权限 -> 踢回首页
  const isAdmin = isPortalAdmin.value
  const hasAnyAdminPerm = [
    'role:view','role:create','role:edit','role:delete',
    'group:view','group:create','group:edit','group:delete',
    'user:view','user:edit','user:create','user:delete',
    'skill:edit','skill:delete','system:config',
  ].some(k => can(k))
  if (!isAdmin && !hasAnyAdminPerm) {
    router.replace('/')
    return
  }
  permsReady.value = true
})
onUnmounted(() => {
  if (savedBannerVisible !== null) bannerVisible.value = savedBannerVisible
})
</script>
