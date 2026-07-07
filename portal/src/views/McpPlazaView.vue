<template>
  <div>
    <NavBar />

    <!-- Hero -->
    <section
      class="pb-12 text-center max-w-[720px] mx-auto animate-fade-up"
      :class="hasVisibleBanner ? 'pt-[248px]' : 'pt-[208px]'"
    >
      <h1 class="text-[52px] font-bold text-text tracking-[-1.6px] leading-[1.05] mb-3 max-md:text-[40px] max-sm:text-[32px]">
        查找可用的 MCP 服务
      </h1>
      <p class="text-[18px] text-text-secondary font-normal mb-8 leading-relaxed">
        查找可用的 MCP 服务，一键复制配置并接入到常用客户端
      </p>

      <!-- Search -->
      <div class="max-w-[520px] mx-auto mb-7 relative">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索 MCP 服务..."
          class="w-full h-12 bg-white border border-[#d2d2d7] rounded-xl pl-11 pr-5 text-base text-text outline-none transition-all duration-200 placeholder:text-text-tertiary focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]"
        >
      </div>

      <!-- Stats -->
      <div class="flex justify-center gap-10">
        <div class="text-center">
          <div class="text-2xl font-bold text-text tracking-[-0.5px]">{{ total }}</div>
          <div class="text-xs text-text-secondary mt-0.5">服务</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-text tracking-[-0.5px]">{{ runningCount }}</div>
          <div class="text-xs text-text-secondary mt-0.5">运行中</div>
        </div>
      </div>
    </section>

    <!-- Error banner -->
    <div
      v-if="error"
      class="max-w-[520px] mx-auto mb-8 p-5 bg-red-50 rounded-2xl border border-red-200 text-center"
    >
      <p class="text-red-800 font-medium text-sm">{{ error }}</p>
      <button
        @click="loadServers(true)"
        class="mt-3 px-5 py-2 text-sm bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors cursor-pointer"
      >
        重试
      </button>
    </div>

    <!-- Grid -->
    <div class="max-w-[1024px] mx-auto px-6 pb-20 min-h-[600px]">
      <McpGrid
        :servers="servers"
        :loading="loading"
        :search-query="searchQuery"
        @select="openDetail"
      />

      <LoadMore
        :has-more="hasMore"
        :total="total"
        label="服务"
        @load-more="loadMore"
      />
    </div>

    <McpDetailModal
      :server="selectedServer"
      :is-open="!!selectedServer"
      @close="selectedServer = null"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMcpServers } from '../composables/useMcpServers.js'
import NavBar from '../components/NavBar.vue'
import McpGrid from '../components/McpGrid.vue'
import LoadMore from '../components/LoadMore.vue'
import McpDetailModal from '../components/McpDetailModal.vue'
import { bannerEnabled, bannerHtml, bannerVisible } from '../composables/useAnnouncement.js'

const {
  servers, loading, error, searchQuery, total, hasMore, loadMore, loadServers,
} = useMcpServers()

const selectedServer = ref(null)
const hasVisibleBanner = computed(() => bannerEnabled.value && bannerVisible.value && !!bannerHtml.value)

const openDetail = (server) => { selectedServer.value = server }

const runningCount = computed(() =>
  servers.value.filter(s => s.status === 'Running').length
)
</script>
