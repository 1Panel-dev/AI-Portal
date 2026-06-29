<template>
  <section class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
    <div class="mb-4">
      <h3 class="text-base font-semibold text-text">CLI 工具 skillctl</h3>
      <p class="text-sm text-text-secondary mt-1">使用本地命令行安装/管理 Skill</p>
    </div>

    <!-- Token 占位区(后续接真实拉取) -->
    <div class="mb-5 rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary px-4 py-3">
      <div class="text-xs text-text-tertiary mb-1.5">你的登录 Token</div>
      <div class="flex items-center gap-3">
        <code class="font-mono text-sm text-text-secondary select-all">••••••••（未生成）</code>
        <button
          type="button"
          disabled
          class="ml-auto px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,0,0,0.08)] text-text-tertiary cursor-not-allowed"
        >复制</button>
      </div>
      <p class="text-[11px] text-text-tertiary mt-1.5">真实 Token 生成/复制功能即将开放</p>
    </div>

    <!-- 6 条主命令 -->
    <div class="mb-5">
      <div class="text-sm font-medium text-text mb-3">快速参考</div>
      <ul class="space-y-2.5 text-sm">
        <li v-for="(item, i) in commands" :key="i" class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <code class="font-mono text-[12.5px] text-text bg-surface-secondary px-2 py-1 rounded-md break-all sm:shrink-0">{{ item.cmd }}</code>
          <span class="text-text-secondary text-[13px]">{{ item.desc }}</span>
        </li>
      </ul>
    </div>

    <!-- 完整文档链接 -->
    <div class="pt-4 border-t border-[rgba(0,0,0,0.06)]">
      <a
        v-if="flags.skillctlDocUrl"
        :href="flags.skillctlDocUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-text hover:underline inline-flex items-center gap-1"
      >查看完整在线文档 →</a>
      <span v-else class="text-sm text-text-tertiary">管理员尚未配置文档地址</span>
    </div>
  </section>
</template>

<script setup>
defineProps({
  flags: { type: Object, required: true },
})

const commands = [
  { cmd: 'skillctl login <endpoint> --token <token>', desc: '登录 1Panel' },
  { cmd: 'skillctl whoami', desc: '查看当前登录身份' },
  { cmd: 'skillctl agent create default --skills-path /path/to/skills', desc: '创建 Agent' },
  { cmd: 'skillctl agent list', desc: '查看 Agent 列表' },
  { cmd: 'skillctl search [keyword]', desc: '搜索 Skill' },
  { cmd: 'skillctl install <skill-name>', desc: '安装 Skill' },
]
</script>
