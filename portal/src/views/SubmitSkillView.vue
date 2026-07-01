<template>
  <div>
    <NavBar />

    <main class="max-w-[600px] mx-auto px-6 pt-[132px] pb-20">
      <h1 class="text-[32px] font-bold text-text text-center mb-1.5 tracking-[-0.5px]">提交技能</h1>
      <p class="text-[15px] text-text-secondary text-center mb-9">分享你的 AI 技能，帮助更多开发者</p>

      <div class="bg-white rounded-modal border border-[rgba(0,0,0,0.04)] p-10 shadow-card">
        <!-- Skill ID -->
        <div class="mb-[22px]">
          <label class="block text-[13px] font-medium text-text mb-[7px]">
            技能 ID <span class="text-[#ff3b30] ml-0.5">*</span>
            <span class="text-text-tertiary text-[11px] font-normal ml-1">英文，小写+连字符</span>
          </label>
          <input
            v-model="form.skill_id"
            type="text"
            placeholder="例如：my-awesome-skill"
            @blur="validateField('skill_id'); checkSkillExists()"
            class="w-full h-[44px] bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none transition-all duration-200 placeholder:text-[#c7c7cc] focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)] disabled:bg-surface-secondary disabled:text-text-secondary disabled:cursor-not-allowed"
            :class="errors.skill_id ? 'border-[#ff3b30] focus:shadow-[0_0_0_3px_rgba(255,59,48,0.1)]' : ''"
          >
          <p v-if="errors.skill_id" class="text-xs text-[#ff3b30] mt-[5px]">{{ errors.skill_id }}</p>
          <div v-if="skillExists" class="mt-1.5 p-2.5 bg-[#fff7ed] border border-[rgba(245,158,11,0.2)] rounded-[10px]">
            <p class="text-xs text-[#92400e]">该技能已存在，你正在提交新版本。请修改下方的<b>版本号</b>（如 v1.0.1），否则将覆盖之前待审核的提交。</p>
          </div>
        </div>

        <!-- Title -->
        <div class="mb-[22px]">
          <label class="block text-[13px] font-medium text-text mb-[7px]">显示名称 <span class="text-[#ff3b30] ml-0.5">*</span></label>
          <input
            v-model="form.title"
            type="text"
            placeholder="例如：My Awesome Skill"
            @blur="validateField('title')"
            class="w-full h-[44px] bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none transition-all duration-200 placeholder:text-[#c7c7cc] focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)] disabled:bg-surface-secondary disabled:text-text-secondary disabled:cursor-not-allowed"
            :class="errors.title ? 'border-[#ff3b30]' : ''"
          >
          <p v-if="errors.title" class="text-xs text-[#ff3b30] mt-[5px]">{{ errors.title }}</p>
        </div>

        <!-- Description -->
        <div class="mb-[22px]">
          <label class="block text-[13px] font-medium text-text mb-[7px]">描述 <span class="text-[#ff3b30] ml-0.5">*</span></label>
          <textarea
            v-model="form.description"
            rows="4"
            placeholder="描述这个技能的功能和使用场景..."
            @blur="validateField('description')"
            class="w-full bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 py-3 text-[15px] text-text outline-none transition-all duration-200 placeholder:text-[#c7c7cc] focus:border-[#86868b] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)] resize-y leading-relaxed disabled:bg-surface-secondary disabled:text-text-secondary disabled:cursor-not-allowed"
            :class="errors.description ? 'border-[#ff3b30]' : ''"
          ></textarea>
          <p v-if="errors.description" class="text-xs text-[#ff3b30] mt-[5px]">{{ errors.description }}</p>
        </div>

        <!-- File Upload -->
        <div class="mb-[22px]">
          <label class="block text-[13px] font-medium text-text mb-[7px]">
            技能包 <span class="text-[#ff3b30] ml-0.5">*</span>
            <span class="text-text-tertiary text-[11px] font-normal ml-1">.zip 文件</span>
          </label>
          <div
            @drop.prevent="handleDrop"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @click="triggerFileInput"
            class="border-2 border-dashed rounded-[14px] p-8 text-center cursor-pointer transition-all duration-200"
            :class="[
              errors.file ? 'border-[#ff3b30] bg-[rgba(255,59,48,0.02)]' :
              isDragging ? 'border-text bg-[rgba(0,0,0,0.02)]' :
              selectedFile ? 'border-text bg-white' :
              'border-[#d2d2d7] bg-[#fafafa] hover:border-[#86868b] hover:bg-surface-secondary'
            ]"
          >
            <input ref="fileInput" type="file" accept=".zip" @change="handleFileSelect" class="hidden">
            <div v-if="!selectedFile">
              <svg class="mx-auto mb-2.5 text-text-tertiary" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <p class="text-sm text-text-secondary">拖拽 .zip 文件到这里，或点击选择</p>
              <p class="text-[11px] text-text-tertiary mt-1.5">包含 skill.md，可选 scripts/、requirements.txt</p>
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
          <p v-if="errors.file" class="text-xs text-[#ff3b30] mt-[5px]">{{ errors.file }}</p>
        </div>

        <!-- Category -->
        <div class="mb-[22px]">
          <label class="block text-[13px] font-medium text-text mb-[7px]">分类 <span class="text-[#ff3b30] ml-0.5">*</span></label>
          <select
            v-model="form.category"
            class="w-full h-[44px] bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none cursor-pointer transition-all duration-200 focus:border-[#86868b]"
          >
            <option v-for="cat in categories.filter(c => c.id !== 'all')" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>

        <!-- Version -->
        <div class="mb-6">
          <label class="block text-[13px] font-medium text-text mb-[7px]">版本号</label>
          <input
            v-model="form.version"
            type="text"
            placeholder="v1.0.0"
            class="w-full h-[44px] bg-white border border-[#d2d2d7] rounded-[10px] px-3.5 text-[15px] text-text outline-none transition-all duration-200 placeholder:text-[#c7c7cc] focus:border-[#86868b] font-mono disabled:bg-surface-secondary disabled:text-text-secondary disabled:cursor-not-allowed"
          >
          <p class="text-[11px] text-text-tertiary mt-[5px]">遵循 semver 规范：v主版本.次版本.修订号（如 v1.0.0 → v1.0.1）。同版本重复提交会覆盖之前的文件。</p>
        </div>

        <!-- Install Preview -->
        <div class="bg-surface-secondary rounded-[10px] p-3.5 mb-6">
          <p class="text-[11px] text-text-tertiary mb-1">安装命令（自动生成）</p>
          <code class="text-[13px] font-mono text-text">skillctl install {{ form.skill_id || '<skill-id>' }}</code>
        </div>

        <!-- Submit -->
        <button
          @click="submit"
          :disabled="submitting"
          class="w-full h-12 bg-accent text-white border-none rounded-xl text-[15px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ submitting ? '上传中...' : '提交技能' }}
        </button>
      </div>
    </main>

    <!-- Success Popup -->
    <Teleport to="body">
      <div v-if="showSuccess" class="fixed inset-0 z-[200] flex items-center justify-center">
        <div class="absolute inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-[8px]" @click="closeSuccess"></div>
        <div class="relative bg-white rounded-modal p-10 max-w-[380px] w-full mx-5 shadow-modal text-center animate-modal-in">
          <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-[#e8f5e9] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h3 class="text-xl font-bold text-text mb-2">提交成功</h3>
          <p class="text-sm text-text-secondary mb-1.5">技能包已上传，等待管理员审核</p>
          <p class="text-xs text-text-tertiary mb-6 font-mono">安装命令：{{ submitInstallCmd }}</p>
          <div class="flex gap-2.5">
            <button @click="closeSuccess" class="flex-1 py-2.5 text-sm font-medium bg-surface-secondary text-text rounded-[10px] border-none cursor-pointer transition-colors hover:bg-[#e8e8ed]">继续提交</button>
            <button @click="goAfterSuccess" class="flex-1 py-2.5 text-sm font-medium bg-accent text-white rounded-[10px] border-none cursor-pointer transition-colors hover:bg-accent-hover">返回首页</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Error Popup -->
    <Teleport to="body">
      <div v-if="showError" class="fixed inset-0 z-[200] flex items-center justify-center">
        <div class="absolute inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-[8px]" @click="showError = false"></div>
        <div class="relative bg-white rounded-modal p-10 max-w-[380px] w-full mx-5 shadow-modal text-center animate-modal-in">
          <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-[rgba(255,59,48,0.1)] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <h3 class="text-xl font-bold text-text mb-2">提交失败</h3>
          <p class="text-sm text-text-secondary mb-6">{{ errorMessage }}</p>
          <button @click="showError = false" class="w-full py-2.5 text-sm font-medium bg-accent text-white rounded-[10px] border-none cursor-pointer transition-colors hover:bg-accent-hover">知道了</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '../components/NavBar.vue'
import { categories } from '../data/categories.js'

const API_BASE = (typeof window !== 'undefined' && window.__APP_BASE__ && !window.__APP_BASE__.includes('__BASE_PATH__') ? (window.__APP_BASE__.endsWith('/') ? window.__APP_BASE__ : window.__APP_BASE__ + '/') + 'api' : (import.meta.env.VITE_API_URL || '/api'))
const router = useRouter()

const form = ref({
  skill_id: '', title: '', description: '',
  category: 'AI 智能', version: 'v1.0.0',
})

const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const submitting = ref(false)
const errors = ref({})
const skillExists = ref(false)
const showSuccess = ref(false)
const showError = ref(false)
const errorMessage = ref('')
const submitInstallCmd = ref('')

const validateField = (field) => {
  const val = form.value[field]
  if (!val || !val.trim()) {
    const labels = { skill_id: '技能 ID', title: '显示名称', description: '描述' }
    errors.value[field] = `${labels[field]}不能为空`
    return false
  }
  if (field === 'skill_id' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val)) {
    errors.value.skill_id = '技能 ID 只能包含小写字母、数字和连字符'
    return false
  }
  delete errors.value[field]
  return true
}

const toSlug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const checkSkillExists = async () => {
  if (!validateField('skill_id')) return
  try {
    const slug = toSlug(form.value.skill_id)
    const res = await fetch(`${API_BASE}/skills?slug=${encodeURIComponent(slug)}`)
    const data = await res.json()
    skillExists.value = res.ok && !!data.id
  } catch { skillExists.value = false }
}

const validateAll = () => {
  let valid = true
  ;['skill_id', 'title', 'description'].forEach(f => {
    if (!validateField(f)) valid = false
  })
  if (!selectedFile.value) { errors.value.file = '请上传 .zip 技能包'; valid = false }
  return valid
}

const triggerFileInput = () => { fileInput.value.click() }

const handleFileSelect = (e) => {
  const file = e.target.files[0]
  if (file && file.name.endsWith('.zip')) {
    selectedFile.value = file; delete errors.value.file
  }
}

const handleDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file && file.name.endsWith('.zip')) {
    selectedFile.value = file; delete errors.value.file
  }
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

const closeSuccess = () => { showSuccess.value = false }

const goAfterSuccess = () => {
  showSuccess.value = false
  router.push('/')
}

const submit = async () => {
  if (!validateAll()) return
  submitting.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('skill_id', form.value.skill_id)
    formData.append('title', form.value.title)
    formData.append('description', form.value.description)
    formData.append('category', form.value.category)
    formData.append('version', form.value.version)
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_BASE}/skills/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    const data = await response.json()
    if (response.ok) {
      submitInstallCmd.value = data.install_command
      showSuccess.value = true
      form.value = { skill_id: '', title: '', description: '', category: 'AI 智能', version: 'v1.0.0' }
      selectedFile.value = null; errors.value = {}; skillExists.value = false
      if (fileInput.value) fileInput.value.value = ''
    } else {
      if (response.status === 401) {
        router.push({ path: '/login', query: { redirect: route.fullPath } })
        return
      }
      errorMessage.value = data.error || '上传失败'; showError.value = true
    }
  } catch (err) {
    errorMessage.value = '网络错误，请稍后重试'; showError.value = true
  } finally { submitting.value = false }
}

onMounted(() => {})
</script>
