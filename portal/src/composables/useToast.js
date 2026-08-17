// portal/src/composables/useToast.js
// 全局唯一 toast 浮层: 各页面/组件共享同一个 toast 状态, 不再各自维护本地 Teleport。
// 用法:
//   import { showToast } from '../composables/useToast.js'
//   showToast('已保存', 'success')
//   showToast('删除失败: xxx', 'error')
import { ref } from 'vue'

// 模块级单例状态
const toast = ref({ show: false, message: '', type: 'info' })
let timer = null

/** 读取共享 toast 状态(供全局 <Toast /> 组件用) */
export function useToast() {
  return { toast }
}

/**
 * 弹出全局 toast
 * @param {string} message 提示内容
 * @param {'success'|'error'|'info'} type 类型, 决定配色
 */
export function showToast(message, type = 'info') {
  toast.value = { show: true, message, type }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { toast.value.show = false }, 3000)
}
