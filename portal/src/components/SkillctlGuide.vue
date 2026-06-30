<template>
  <section class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-card">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-base font-semibold text-text">CLI 工具 skillctl</h3>
        <p class="text-sm text-text-secondary mt-1">使用本地命令行安装/管理 Skill</p>
      </div>
      <span v-if="version" class="text-xs text-text-tertiary bg-surface-secondary px-2.5 py-1 rounded-full">v{{ version }}</span>
    </div>

    <!-- 下载区域 -->
    <div class="mb-5 rounded-xl border border-[rgba(0,0,0,0.06)] bg-surface-secondary px-4 py-3">
      <div class="text-xs text-text-tertiary mb-2.5">下载最新版本</div>
      <div class="flex flex-wrap gap-2">
        <a
          v-for="(item, i) in platforms"
          :key="i"
          :href="item.url"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,0,0,0.08)] bg-white hover:bg-surface-secondary transition-colors cursor-pointer no-underline text-text"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </a>
      </div>
    </div>

    <!-- Token 占位区 -->
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
      <router-link
        to="/docs?chapter=skillctl"
        class="text-sm text-text hover:underline inline-flex items-center gap-1"
      >查看完整在线文档 →</router-link>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const version = ref('')

const platforms = [
  { icon: '🪟', label: 'Windows', url: '/downloads/skillctl-windows-amd64.exe' },
  { icon: '🍎', label: 'macOS Intel', url: '/downloads/skillctl-darwin-amd64' },
  { icon: '🍎', label: 'macOS Apple Silicon', url: '/downloads/skillctl-darwin-arm64' },
  { icon: '🐧', label: 'Linux x86_64', url: '/downloads/skillctl-linux-amd64' },
  { icon: '🐧', label: 'Linux ARM64', url: '/downloads/skillctl-linux-arm64' },
]

const commands = [
  { cmd: 'skillctl login <endpoint> --token <token>', desc: '登录 1Panel' },
  { cmd: 'skillctl whoami', desc: '查看当前登录身份' },
  { cmd: 'skillctl agent create default --skills-path /path/to/skills', desc: '创建 Agent' },
  { cmd: 'skillctl agent list', desc: '查看 Agent 列表' },
  { cmd: 'skillctl search [keyword]', desc: '搜索 Skill' },
  { cmd: 'skillctl install <skill-name>', desc: '安装 Skill' },
]

onMounted(async () => {
  try {
    const res = await fetch('/api/version')
    const data = await res.json()
    version.value = data.version || ''
  } catch {
    // ignore
  }
})
</script>
