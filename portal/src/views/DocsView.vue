<template>
  <div class="min-h-screen bg-[#f5f5f7]">
    <div class="h-[92px]"></div>

    <div class="max-w-[1280px] mx-auto px-6 pb-16 flex gap-8">
      <!-- 左侧:章节导航 -->
      <aside class="w-[200px] shrink-0">
        <div class="sticky top-[100px]">
          <button @click="goBack"
            class="w-full flex items-center gap-1.5 px-3 py-2 text-[14px] font-semibold text-text hover:text-text-secondary transition-colors rounded-lg no-underline">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            返回
          </button>

          <div class="mx-3 my-2 border-t border-[rgba(0,0,0,0.06)]"></div>

          <nav class="flex flex-col gap-0.5">
            <button
              v-for="chapter in chapters"
              :key="chapter.id"
              @click="switchChapter(chapter.id)"
              class="text-left pl-8 pr-3 py-2 text-[13px] rounded-lg transition-colors no-underline"
              :class="activeId === chapter.id
                ? 'font-semibold text-text bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                : 'text-text-secondary hover:text-text hover:bg-black/5'"
            >
              {{ chapter.label }}
            </button>
          </nav>
        </div>
      </aside>

      <!-- 中间:正文 -->
      <main ref="mainEl" class="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-[rgba(0,0,0,0.04)] p-8 md:p-10">
        <p v-if="activeChapter?.description" class="text-[13px] text-[#2563eb] bg-[#eef2ff] border border-[#dbeafe] rounded-xl px-4 py-3 mb-6 leading-relaxed">{{ activeChapter.description }}</p>
        <div v-if="activeChapter" class="markdown-body" v-html="activeChapter.html"></div>
        <div v-else class="text-text-secondary text-[14px]">未找到文档内容。</div>
      </main>

      <!-- 右侧:本章节 TOC(窄屏自动隐藏) -->
      <aside v-if="activeChapter?.toc?.length" class="w-[200px] shrink-0 hidden xl:block">
        <div class="sticky top-[100px]">
          <div class="text-[11px] font-semibold text-text-tertiary uppercase tracking-[1.2px] px-3 mb-2">本章节</div>
          <nav class="flex flex-col gap-0.5 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
            <a
              v-for="item in activeChapter.toc"
              :key="item.slug"
              :href="`#${item.slug}`"
              @click.prevent="scrollToHeading(item.slug)"
              class="block text-left py-1 text-[12px] leading-relaxed rounded transition-colors no-underline border-l-2"
              :class="[
                item.level === 3 ? 'pl-6 pr-2' : 'pl-3 pr-2',
                activeSlug === item.slug
                  ? 'text-text font-medium border-text bg-black/[0.03]'
                  : 'text-text-secondary hover:text-text border-transparent'
              ]"
            >
              {{ item.text }}
            </a>
          </nav>
        </div>
      </aside>
    </div>

    <!-- 回到顶部:滚动超过一屏才出现 -->
    <transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <button
        v-show="showBackToTop"
        @click="backToTop"
        aria-label="回到顶部"
        class="fixed bottom-8 right-8 z-50 w-11 h-11 rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.12)] border border-[rgba(0,0,0,0.06)] flex items-center justify-center text-text hover:bg-[#f5f5f7] hover:shadow-[0_6px_20px_rgba(0,0,0,0.16)] transition-shadow"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { loadAllChapters } from '../lib/markdown.js'

const router = useRouter()
const route = useRoute()
const chapters = loadAllChapters()
const initialChapterId = () => {
  const id = String(route.query.chapter || '')
  return chapters.some(c => c.id === id) ? id : (chapters[0]?.id || '')
}
const activeId = ref(initialChapterId())
const activeSlug = ref('')
const mainEl = ref(null)
const showBackToTop = ref(false)

const activeChapter = computed(() => chapters.find(c => c.id === activeId.value))

const goBack = () => router.back()

const backToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

// 滚过一屏才显示「回到顶部」,避免短文档场景下按钮抢眼
const onScroll = () => {
  showBackToTop.value = window.scrollY > window.innerHeight
}

const switchChapter = (id) => {
  activeId.value = id
  activeSlug.value = ''
  // 切章节时滚到页面顶部
  window.scrollTo({ top: 0, behavior: 'instant' })
}

// 点击 TOC 项:平滑滚到对应 heading,顶部留 92px 给导航栏
const scrollToHeading = (slug) => {
  const el = document.getElementById(slug)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - 92
  window.scrollTo({ top: y, behavior: 'smooth' })
}

// 滚动跟随高亮:IntersectionObserver 监听所有 h2/h3
// 用「最靠近顶部、且已露出」的 heading 作为当前项,体验最自然
let observer = null
const setupScrollSpy = () => {
  if (observer) { observer.disconnect(); observer = null }
  if (!mainEl.value) return
  const headings = mainEl.value.querySelectorAll('h2[id], h3[id]')
  if (!headings.length) return

  // 用 Map 跟踪每个 heading 的可见状态
  const visibility = new Map()
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      visibility.set(entry.target.id, entry.isIntersecting)
    }
    // 在所有「当前可见」的 heading 里,取 DOM 顺序最早的一个
    // 滚到底部时没有 heading 在 rootMargin 内 → 保留最后一次的 activeSlug
    for (const h of headings) {
      if (visibility.get(h.id)) {
        activeSlug.value = h.id
        return
      }
    }
  }, {
    // 上 -80px 让顶部导航不挡;下 -70% 让 heading 进入视窗上半部就算激活
    rootMargin: '-80px 0px -70% 0px',
    threshold: 0
  })
  headings.forEach(h => observer.observe(h))
}

// Mermaid 渲染(懒加载,仅当当前章节包含 .mermaid 块时执行)
let mermaidPromise = null
async function renderMermaid(scopeEl) {
  if (!scopeEl) return
  if (!scopeEl.querySelector('.mermaid')) return
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(m => {
      const mermaid = m.default || m
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })
      return mermaid
    })
  }
  const mermaid = await mermaidPromise
  await mermaid.run({ nodes: scopeEl.querySelectorAll('.mermaid:not([data-processed="true"])') })
}

watch(() => route.query.chapter, async (chapter) => {
  const id = String(chapter || '')
  if (!id || !chapters.some(c => c.id === id) || activeId.value === id) return
  activeId.value = id
  activeSlug.value = ''
  await nextTick()
  renderMermaid(mainEl.value)
  setupScrollSpy()
})

watch(activeId, async () => {
  await nextTick()
  renderMermaid(mainEl.value)
  setupScrollSpy()
})

onMounted(async () => {
  await nextTick()
  renderMermaid(mainEl.value)
  setupScrollSpy()
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
  window.removeEventListener('scroll', onScroll)
})
</script>

<style>
/* 亮色代码高亮主题（全局注入一次，避免被 scoped 抹掉） */
@import 'highlight.js/styles/github.css';
</style>

<style scoped>
/* Apple 极简亮色风格的 Markdown 排版 */
.markdown-body :deep(h1) {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #1d1d1f;
  margin: 0 0 4px;
}
.markdown-body :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  color: #1d1d1f;
  margin: 28px 0 10px;
  padding-top: 4px;
}
.markdown-body :deep(h3) {
  font-size: 15px;
  font-weight: 600;
  color: #1d1d1f;
  margin: 20px 0 8px;
}
.markdown-body :deep(p) {
  font-size: 14px;
  line-height: 1.7;
  color: #6e6e73;
  margin: 0 0 12px;
}
.markdown-body :deep(strong) {
  color: #1d1d1f;
  font-weight: 600;
}
.markdown-body :deep(a) {
  color: #1d1d1f;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: rgba(0,0,0,0.2);
}
.markdown-body :deep(a:hover) {
  text-decoration-color: #1d1d1f;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 14px;
  padding-left: 20px;
}
.markdown-body :deep(ul) { list-style: none; padding-left: 0; }
.markdown-body :deep(ul li) {
  position: relative;
  padding-left: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #6e6e73;
  margin: 6px 0;
}
.markdown-body :deep(ul li::before) {
  content: '';
  position: absolute;
  left: 2px;
  top: 11px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #1d1d1f;
}
.markdown-body :deep(ol li) {
  font-size: 14px;
  line-height: 1.7;
  color: #6e6e73;
  margin: 6px 0;
}
.markdown-body :deep(blockquote) {
  background: #fff7e6;
  border: 1px solid #fde2a4;
  border-radius: 12px;
  padding: 14px 16px;
  margin: 14px 0;
  color: #92651b;
  font-size: 13px;
  line-height: 1.7;
}
.markdown-body :deep(blockquote p) {
  margin: 0;
  color: #92651b;
  font-size: 13px;
}
.markdown-body :deep(blockquote strong) {
  color: #6b4b0e;
}
.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: rgba(0,0,0,0.05);
  padding: 1px 6px;
  border-radius: 4px;
  color: #1d1d1f;
}
.markdown-body :deep(pre.hljs),
.markdown-body :deep(pre) {
  background: #f5f5f7;
  border: 1px solid rgba(0,0,0,0.04);
  border-radius: 12px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 12px 0;
  font-size: 12.5px;
  line-height: 1.6;
}
.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 12.5px;
}
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
  margin: 12px 0;
  display: block;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(0,0,0,0.08);
  padding: 8px 12px;
  text-align: left;
}
.markdown-body :deep(th) {
  background: #f5f5f7;
  font-weight: 600;
  color: #1d1d1f;
}
.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid rgba(0,0,0,0.08);
  margin: 24px 0;
}
.markdown-body :deep(.mermaid) {
  background: #f5f5f7;
  border: 1px solid rgba(0,0,0,0.04);
  border-radius: 12px;
  padding: 14px 16px;
  margin: 12px 0;
  text-align: center;
}
</style>
