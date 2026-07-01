<template>
  <Teleport to="body">
    <div
      v-if="bannerVisible && bannerEnabled && bannerHtml"
      class="fixed left-0 right-0 top-0 h-10 overflow-hidden bg-[#2563eb]/95 text-white shadow-[0_2px_12px_rgba(37,99,235,0.22)] backdrop-blur-xl transition-opacity"
      :class="visible ? 'z-[230] opacity-30' : 'z-[270]'"
      role="status"
    >
      <div class="mx-auto flex h-full max-w-[1024px] items-center gap-2.5 px-6 text-[13.5px] leading-5 text-white">
        <svg class="h-4 w-4 shrink-0 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <div class="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          <span class="inline-block animate-announcement-marquee will-change-transform" v-html="bannerHtml"></span>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md bg-white/15 px-2 py-0.5 text-lg leading-none text-white/85 transition-colors hover:bg-white/25 hover:text-white"
          aria-label="关闭公告"
          @click="bannerVisible = false"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="visible && dialogEnabled && dialogHtml"
      class="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 px-5 py-8 backdrop-blur-[8px] animate-fade-in"
      role="presentation"
      @click="close()"
    >
      <div
        class="w-full max-w-[500px] overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)] animate-modal-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        @click.stop
      >
        <div class="px-8 pt-8 text-center">
          <div class="mx-auto mb-4 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-gradient-to-br from-[#0071e3] to-[#5856d6] text-white shadow-[0_8px_24px_rgba(0,113,227,0.24)]">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <h3 id="announcement-title" class="text-[20px] font-semibold tracking-[-0.35px] text-text">{{ dialogTitle }}</h3>
        </div>

        <div class="dialog-body px-8 pt-5 text-[14px] leading-[1.75] text-text-secondary" v-html="dialogHtml"></div>

        <div class="mt-7 border-t border-[rgba(0,0,0,0.06)] px-8 py-5">
          <label class="mb-4 flex cursor-pointer select-none items-center gap-2 text-[13px] text-text-secondary">
            <input v-model="dontShowAgain" type="checkbox" class="h-4 w-4 accent-accent" />
            <span>不再提示</span>
          </label>
          <button
            type="button"
            class="h-[46px] w-full rounded-xl bg-accent text-[15px] font-semibold text-white transition-colors hover:bg-accent-hover"
            @click="close()"
          >
            我已了解
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  bannerEnabled, bannerHtml, bannerVisible,
  dialogEnabled, dialogTitle, dialogHtml, dialogVersion,
  dismissDialogKey,
} from '../composables/useAnnouncement.js'

const visible = ref(false)
const dontShowAgain = ref(false)

// 会话锁改为 localStorage + 时间戳:企微 WebView 刷新会清 sessionStorage,导致每次刷新都弹。
// 改用 localStorage 存时间戳,1 小时内的刷新算"同一会话",不重复弹。
// 超过 1 小时或关闭 Tab 重开(模拟新会话)会重新弹,但用户勾了「不再提示」则永久不弹。
const SESSION_SEEN_KEY = 'aiportal_dialog_seen_timestamp'
const SESSION_TTL = 3600000 // 1 小时有效期(毫秒)

// 弹框判定: 监听 dialogHtml(初始 '', fetch 回来一定变非空, 必然触发)。
// 三道门槛任一不满足都不弹: 后端开启 dialog / 本会话没看过 / 没勾过永久不再提示。
// 永久不再提示的 key 带 dialog_version, admin 改完 version 自增即 key 失效, 用户重新看到。
watch(dialogHtml, (html) => {
  if (!html || !dialogEnabled.value) return
  if (localStorage.getItem(dismissDialogKey()) === 'true') return
  const lastSeen = parseInt(localStorage.getItem(SESSION_SEEN_KEY) || '0', 10)
  if (lastSeen && Date.now() - lastSeen < SESSION_TTL) return
  visible.value = true
})

const close = () => {
  // 写临时锁(1 小时有效期):1 小时内刷新不弹,模拟会话级记忆
  safeSet(localStorage, SESSION_SEEN_KEY, Date.now().toString())
  // 勾了「不再提示」就跨会话永久记忆(version 变更前不再弹),
  // 无论用户是点按钮还是点遮罩关闭——勾选即代表永久记忆意图
  if (dontShowAgain.value) {
    safeSet(localStorage, dismissDialogKey(), 'true')
  }
  visible.value = false
}

// Web Storage 在隐私模式/禁用/配额耗尽时 setItem 可能抛 SecurityError/QuotaExceededError,
// 包一层确保即使写入失败也能关掉弹框(visible=false 照常执行),不锁死 UI
const safeSet = (store, key, value) => {
  try { store.setItem(key, value) } catch (e) { /* 存储不可用,忽略 */ }
}
</script>

<style scoped>
/* dialog 正文内 HTML 元素的最小样式集
   admin 可在公告里写 <div class="dialog-alert">、<p class="dialog-footnote">,
   样式在这里集中定义,避免每条公告都要带 inline class 列表 */

/* 模拟 space-y-3: v-html 注入后没法用 Tailwind 的 space-y, 这里靠 CSS 实现 */
.dialog-body :deep(> *) {
  margin: 0;
}
.dialog-body :deep(> * + *) {
  margin-top: 12px;
}

.dialog-body :deep(strong) {
  font-weight: 600;
  color: #1d1d1f;
}
.dialog-body :deep(a) {
  color: #0071e3;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 黄色警告框: ::before 注入三角警告图标, admin 只需写 <div class="dialog-alert">...</div>
   不能用 flex! v-html 注入后里面的 <strong>/<a> 会变成 flex item 被 gap 拆开。
   改用 position+padding-left 给图标留位置, 文本继续走正常 inline 流。 */
.dialog-body :deep(.dialog-alert) {
  position: relative;
  margin-top: 16px;
  border-radius: 16px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  padding: 12px 16px 12px 46px;
  font-size: 13px;
  line-height: 1.65;
  color: #92400e;
}
.dialog-body :deep(.dialog-alert::before) {
  content: '';
  position: absolute;
  top: 14px;
  left: 16px;
  width: 18px;
  height: 18px;
  background-color: #f59e0b;
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z'/><path d='M12 9v4'/><path d='M12 17h.01'/></svg>");
          mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z'/><path d='M12 9v4'/><path d='M12 17h.01'/></svg>");
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-size: contain;
          mask-size: contain;
}
.dialog-body :deep(.dialog-alert strong) {
  color: #78350f;
  font-weight: 600;
}
.dialog-body :deep(.dialog-alert a) {
  color: #78350f;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.dialog-body :deep(.dialog-alert a:hover) {
  color: #b45309;
}

/* 小字脚注: <p class="dialog-footnote"> */
.dialog-body :deep(.dialog-footnote) {
  padding-top: 4px;
  font-size: 13px;
  color: #a8a8b3;
}
</style>
