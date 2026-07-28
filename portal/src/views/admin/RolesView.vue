<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">角色权限</h1>
        <p class="text-text-secondary text-sm mt-1">角色管「能做什么操作」，与资源组（看到什么资源）不耦合。权限粒度 = 模块 × CRUD</p>
      </div>
      <button disabled class="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-all opacity-50 cursor-not-allowed" title="第三期开放">
        <Plus class="w-4 h-4" />新建角色
      </button>
    </div>

    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden shadow-card">
      <div class="grid grid-cols-[1.2fr_2fr_1fr_120px] gap-3 px-4 py-3 text-xs font-semibold text-text-secondary bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
        <div>角色</div><div>权限范围</div><div>用户数</div><div class="text-right">操作</div>
      </div>
      <div v-for="r in roles" :key="r.key" class="grid grid-cols-[1.2fr_2fr_1fr_120px] gap-3 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.04)] last:border-b-0 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium text-text">{{ r.name }}</span>
          <span class="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600">内置</span>
        </div>
        <div class="text-xs text-text-tertiary">{{ r.scope }}</div>
        <div class="text-text-secondary">{{ r.userCount }}</div>
        <div class="text-right text-xs text-text-tertiary">{{ r.action }}</div>
      </div>
    </div>

    <div class="flex items-start gap-2.5 px-4 py-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg mt-4 text-[13px] text-[#1e40af]">
      <Info class="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>角色 CRUD 完整实现（权限勾选树、新建/编辑自定义角色）属第三期。前两期角色页只读。</div>
    </div>
  </div>
</template>

<script setup>
import { Plus, Info } from 'lucide-vue-next'

// Phase 1：静态内置角色展示，不调 /api/admin/roles（该接口 Phase 1 未建）。
// 超级管理员 = is_portal_admin=true，跳过所有权限检查；普通用户 = 默认 role。
const roles = [
  {
    key: 'admin',
    name: '超级管理员',
    scope: 'is_portal_admin=true，跳过所有权限检查',
    userCount: '-',
    action: '不可操作',
  },
  {
    key: 'user',
    name: '普通用户',
    scope: 'model:view · key:* · skill:view/create · mcp:view',
    userCount: '-',
    action: '查看',
  },
]
</script>
