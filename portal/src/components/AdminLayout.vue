<template>
  <NavBar />
  <div class="flex" style="padding-top:52px">
    <!-- Sidebar -->
    <aside
      class="flex-shrink-0 flex flex-col bg-white border-r border-[rgba(0,0,0,0.05)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
      style="position:sticky; top:52px; height:calc(100vh - 52px)"
      :style="{ width: collapsed ? '64px' : '240px' }"
    >
      <!-- Toggle row -->
      <div
        class="flex-shrink-0 h-11 flex items-center border-b border-[rgba(0,0,0,0.04)]"
        :class="collapsed ? 'justify-center px-0' : 'justify-between px-4'"
      >
        <span v-if="!collapsed" class="text-[11px] font-medium text-text-tertiary tracking-wide select-none">导航菜单</span>
        <button
          @click="collapsed = !collapsed"
          class="group flex items-center justify-center rounded-lg text-text-tertiary hover:text-text hover:bg-[rgba(0,0,0,0.06)] transition-all duration-150"
          :class="collapsed ? 'w-8 h-8' : 'w-6 h-6'"
          :title="collapsed ? '展开菜单' : '收起菜单'"
        >
          <PanelLeftClose v-if="!collapsed" class="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          <PanelLeftOpen v-else class="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <!-- Menu items -->
      <nav class="flex-1 overflow-y-auto pt-6 pb-4 px-3 space-y-5" :class="collapsed ? 'px-1.5' : ''">
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">概览</p>
          <div class="space-y-0.5">
            <SideItem to="/admin/stats" :active="isActive('/admin/stats')" :collapsed="collapsed" title="数据统计">
              <BarChart3 class="w-5 h-5" /><template #label>数据统计</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">内容管理</p>
          <div class="space-y-0.5">
            <SideItem to="/admin" :active="isActive('/admin')" :collapsed="collapsed" title="审核管理">
              <ClipboardCheck class="w-5 h-5" /><template #label>审核管理</template>
            </SideItem>
            <SideItem to="/admin/skills" :active="isActive('/admin/skills')" :collapsed="collapsed" title="技能管理">
              <Puzzle class="w-5 h-5" /><template #label>技能管理</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">用户与权限</p>
          <div class="space-y-0.5">
            <SideItem to="/admin/users" :active="isActive('/admin/users')" :collapsed="collapsed" title="用户管理">
              <UserCog class="w-5 h-5" /><template #label>用户管理</template>
            </SideItem>
          </div>
        </section>
        <div class="mx-3 h-px bg-[rgba(0,0,0,0.04)]"></div>
        <section>
          <p v-if="!collapsed" class="px-2.5 mb-1.5 text-[10px] font-medium text-text-tertiary tracking-[0.12em] uppercase select-none">系统设置</p>
          <div class="space-y-0.5">
            <SideItem to="/admin/config" :active="isActive('/admin/config')" :collapsed="collapsed" title="系统配置">
              <Sliders class="w-5 h-5" /><template #label>系统配置</template>
            </SideItem>
            <SideItem to="/admin/oauth" :active="isActive('/admin/oauth')" :collapsed="collapsed" title="第三方登录">
              <KeyRound class="w-5 h-5" /><template #label>第三方登录</template>
            </SideItem>
          </div>
        </section>
      </nav>

      <div v-if="!collapsed" class="flex-shrink-0 px-3 pb-4 pt-1">
        <div class="rounded-xl bg-[rgba(0,0,0,0.02)] px-3.5 py-3">
          <p class="text-[10px] text-text-tertiary leading-relaxed">
            AI-Portal <span class="opacity-30 mx-1">·</span> <span class="font-semibold text-text-secondary">v1.0.3</span>
          </p>
        </div>
      </div>
    </aside>

    <main class="flex-1 min-h-[calc(100vh-52px)]">
      <div class="px-10 pt-[72px] pb-16">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import NavBar from './NavBar.vue'
import SideItem from './admin/SideItem.vue'
import { BarChart3, ClipboardCheck, Puzzle, UserCog, Sliders, KeyRound, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'

const route = useRoute()
const collapsed = ref(false)

function isActive(path) {
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}
</script>
