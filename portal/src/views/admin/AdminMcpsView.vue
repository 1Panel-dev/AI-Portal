<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-text">MCP 管理</h1>
        <p class="text-text-secondary text-sm mt-1">MCP 资源来自 1Panel，无本地表</p>
      </div>
    </div>
    <div class="py-14 px-6 text-center text-text-tertiary text-[13px] bg-white border border-dashed border-[rgba(0,0,0,0.1)] rounded-xl">
      <Grid3x3 class="w-10 h-10 mx-auto mb-3 opacity-40" />
      <div>MCP 管理页完整实现属第三期</div>
      <span class="inline-block mt-2 px-2.5 py-0.5 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-full text-[11px] text-text-tertiary">第三期开放</span>
    </div>
  </div>
</template>

<script setup>
import { Grid3x3 as Grid3X3 } from 'lucide-vue-next'
</script>
