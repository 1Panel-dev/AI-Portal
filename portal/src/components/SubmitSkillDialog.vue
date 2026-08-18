<template>
  <AppDialog :open="open" title="提交技能" size="lg" @close="handleClose">
    <!-- 成功态 -->
    <div v-if="submitted" class="py-6 text-center">
      <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-[#e8f5e9] flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <p class="text-text font-medium mb-1">提交成功</p>
      <p class="text-xs text-text-tertiary mb-3">技能包已上传，等待管理员审核</p>
      <p class="text-xs text-text-tertiary font-mono">安装命令：{{ submitInstallCmd }}</p>
    </div>

    <!-- 第一步：选文件 -->
    <div v-else-if="step === 'file'">
      <div v-if="!canSubmit" class="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
        你没有提交技能的权限（skill:create）。
      </div>
      <p class="text-xs text-text-secondary mb-4">上传 Skill 包，下一步会读取包内 <b>skill.md</b> 的信息，可补充/修改后提交。</p>

      <div
        @drop.prevent="handleDrop" @dragover.prevent="isDragging = true" @dragleave="isDragging = false" @click="triggerFileInput"
        class="border-2 border-dashed rounded-[14px] p-8 text-center cursor-pointer transition-all duration-200"
        :class="[fileError ? 'border-[#ff3b30] bg-[rgba(255,59,48,0.02)]' : isDragging ? 'border-text bg-[rgba(0,0,0,0.02)]' : selectedFile ? 'border-text bg-white' : 'border-[#d2d2d7] bg-[#fafafa] hover:border-[#86868b] hover:bg-surface-secondary']">
        <input ref="fileInput" type="file" accept=".zip,.7z,.tar,.gz,.tgz" @change="handleFileSelect" class="hidden">
        <div v-if="!selectedFile">
          <svg class="mx-auto mb-2.5 text-text-tertiary" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p class="text-sm text-text-secondary">拖拽 Skill 包到此处，或点击上传</p>
          <p class="text-[11px] text-text-tertiary mt-1.5">支持格式：.zip、.7z、.tar、.tar.gz</p>
          <p class="text-[11px] text-text-tertiary">单个文件不超过 5MB · 包内必须包含 skill.md</p>
        </div>
        <div v-else class="flex items-center justify-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="text-sm font-medium text-text">{{ selectedFile.name }}</span>
          <span class="text-xs text-text-tertiary">{{ formatSize(selectedFile.size) }}</span>
          <button @click.stop="removeFile" class="ml-2 text-text-tertiary hover:text-[#ff3b30] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <p v-if="fileError" class="text-xs text-[#ff3b30] mt-1">{{ fileError }}</p>
      <p v-if="errorMessage" class="text-xs text-red-500 mt-3">{{ errorMessage }}</p>
    </div>

    <!-- 第二步：确认表单 -->
    <div v-else class="max-h-[65vh] overflow-y-auto -mx-1 px-1">
      <div v-if="manual" class="mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
        该格式暂不支持自动读取 skill.md，请手动填写下方字段。版本号须与包内 skill.md 一致。
      </div>
      <div class="mb-4">
        <label class="block text-[13px] font-medium text-text mb-1">技能名称 (name) <span class="text-[#ff3b30] ml-0.5">*</span></label>
        <input v-model="form.name" type="text" placeholder="my-awesome-skill"
          class="w-full h-11 bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none focus:border-[#86868b]">
        <p class="text-[11px] text-text-tertiary mt-1">技能唯一标识，英文小写 + 连字符</p>
      </div>

      <div class="mb-4">
        <label class="block text-[13px] font-medium text-text mb-1">描述 <span class="text-[#ff3b30] ml-0.5">*</span></label>
        <textarea v-model="form.description" rows="3" placeholder="描述这个技能的功能和使用场景..."
          class="w-full bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 py-3 text-[15px] text-text outline-none focus:border-[#86868b] resize-y leading-relaxed"></textarea>
      </div>

      <div class="mb-4">
        <label class="block text-[13px] font-medium text-text mb-1">分类</label>
        <input v-model="form.category" type="text" placeholder="skill"
          class="w-full h-11 bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none focus:border-[#86868b]">
      </div>

      <div class="mb-4">
        <label class="block text-[13px] font-medium text-text mb-1">版本号 <span class="text-[#ff3b30] ml-0.5">*</span></label>
        <input v-model="form.version" type="text" placeholder="0.1.0"
          class="w-full h-11 bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none focus:border-[#86868b] font-mono">
        <p class="text-[11px] mt-1" :class="pkgVersion ? 'text-text-tertiary' : 'text-amber-600'">
          <template v-if="pkgVersion">版本来自 skill.md（{{ pkgVersion }}），可修改</template>
          <template v-else-if="lastVersion">包内无版本，请手动填写（上一个版本：{{ lastVersion }}）</template>
          <template v-else>包内无版本，请手动填写</template>
        </p>
      </div>

      <p v-if="errorMessage" class="text-xs text-red-500 mt-3">{{ errorMessage }}</p>
    </div>

    <template #footer>
      <template v-if="submitted">
        <button @click="handleClose" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover">知道了</button>
      </template>
      <template v-else-if="step === 'file'">
        <button @click="handleClose" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary">取消</button>
        <button @click="goParse" :disabled="parsing || !selectedFile || !canSubmit" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">{{ parsing ? '解析中...' : '下一步' }}</button>
      </template>
      <template v-else>
        <button @click="step = 'file'" :disabled="submitting" class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary">上一步</button>
        <button @click="submit" :disabled="submitting" class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">{{ submitting ? '上传中...' : '提交技能' }}</button>
      </template>
    </template>
  </AppDialog>

  <!-- 版本不一致确认弹框(套在提交弹框之上) -->
  <AppDialog
    :open="confirmMismatch"
    title="版本号不一致"
    type="confirm"
    confirmText="以填写版本为准"
    cancelText="返回修改"
    @close="confirmMismatch = false"
    @confirm="confirmSubmit"
  >
    Skill 包内的版本号与当前填写内容不一致，包内版本：{{ pkgVersion }}，填写版本：{{ form.version }}，是否以当前填写内容为准？
  </AppDialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import AppDialog from './AppDialog.vue'
import { loadPermissions, can } from '../composables/usePermissions.js'
import { errMsg } from '../lib/apiBase.js'
import { showToast } from '../composables/useToast.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'submitted'])

const step = ref('file')   // file | form | submitted
const selectedFile = ref(null)
const fileInput = ref(null)
const isDragging = ref(false)
const parsing = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const form = ref({ name: '', description: '', category: 'skill', version: '' })
const lastVersion = ref('')
const pkgVersion = ref('')       // skill.md 里带的版本(空 = 包内无版本)
const manual = ref(false)
const confirmMismatch = ref(false)  // 版本不一致确认态
const fileError = ref('')
const errorMessage = ref('')
const submitInstallCmd = ref('')
const canSubmit = computed(() => can('skill:create'))

const triggerFileInput = () => { fileInput.value.click() }
const isSupportedArchive = (name) => {
  const n = (name || '').toLowerCase()
  return n.endsWith('.zip') || n.endsWith('.7z') || n.endsWith('.tar') || n.endsWith('.tar.gz') || n.endsWith('.tgz')
}
const pickFile = (file) => {
  if (!file) return
  if (!isSupportedArchive(file.name)) { fileError.value = '仅支持 .zip / .7z / .tar / .tar.gz 格式'; return }
  if (file.size > 5 * 1024 * 1024) { fileError.value = '单个文件不能超过 5MB'; return }
  selectedFile.value = file; fileError.value = ''
}
const handleFileSelect = (e) => { pickFile(e.target.files[0]) }
const handleDrop = (e) => {
  isDragging.value = false
  pickFile(e.dataTransfer.files[0])
}
const removeFile = () => {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}
const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 第一步 → 解析 skill.md, 预填表单
const goParse = async () => {
  if (!selectedFile.value) { fileError.value = '请上传技能包'; return }
  parsing.value = true
  errorMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('file', selectedFile.value)
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/skills/parse`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) errorMessage.value = '登录已过期，请重新登录'
      else errorMessage.value = errMsg(data, '解析失败')
      return
    }
    form.value = {
      name: data.name || '',
      description: data.description || '',
      category: data.category || 'skill',
      version: data.suggestedVersion || '',
    }
    lastVersion.value = data.lastVersion || ''
    pkgVersion.value = data.version || ''
    manual.value = !!data.manual
    step.value = 'form'
  } catch (e) {
    errorMessage.value = '网络错误，请稍后重试'
  } finally {
    parsing.value = false
  }
}

// 第二步 → 提交(先校验, 版本不一致时弹确认框)
const submit = () => {
  if (!form.value.name.trim()) { errorMessage.value = '请填写技能名称'; return }
  if (!form.value.version.trim()) { errorMessage.value = '请填写版本号'; return }
  // 手填版本与 skill.md 版本不一致 → 弹确认框(等价 1Panel「是否以填写内容为准」)
  if (pkgVersion.value && pkgVersion.value !== form.value.version.trim()) {
    confirmMismatch.value = true
    errorMessage.value = ''
    return
  }
  doSubmit()
}

// 确认以填写版本为准 → 正式提交
const confirmSubmit = () => {
  confirmMismatch.value = false
  doSubmit()
}

const doSubmit = async () => {
  submitting.value = true
  errorMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('file', selectedFile.value)
    fd.append('name', form.value.name.trim())
    fd.append('description', form.value.description.trim())
    fd.append('category', form.value.category.trim() || 'skill')
    fd.append('version', form.value.version.trim())
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/skills/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      submitInstallCmd.value = data.install_command
      submitted.value = true
      emit('submitted')
    } else if (res.status === 401) {
      errorMessage.value = '登录已过期，请重新登录'
    } else {
      // 优先展示具体原因(reason), 兜底通用 error; 同时浮框提示, 便于排查(如 1Panel 版本已存在等)
      const msg = errMsg(data, '上传失败')
      errorMessage.value = msg
      showToast(msg, 'error')
    }
  } catch (e) {
    errorMessage.value = '网络错误，请稍后重试'
  } finally {
    submitting.value = false
  }
}

const reset = () => {
  step.value = 'file'
  submitted.value = false
  errorMessage.value = ''
  fileError.value = ''
  selectedFile.value = null
  form.value = { name: '', description: '', category: 'skill', version: '' }
  lastVersion.value = ''
  pkgVersion.value = ''
  manual.value = false
  confirmMismatch.value = false
  if (fileInput.value) fileInput.value.value = ''
}

const handleClose = () => { emit('close') }

watch(() => props.open, (v) => { if (v) reset() })
onMounted(() => { loadPermissions() })
</script>
