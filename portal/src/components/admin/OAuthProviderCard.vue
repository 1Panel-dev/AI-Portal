<script setup>
import { ref, reactive, watch } from 'vue'

const props = defineProps({
  provider: { type: Object, required: true },
  apiBase: { type: String, required: true },
})
const emit = defineEmits(['updated'])

// 表单状态
const enabled = ref(false)
const sortOrder = ref(0)
const formValues = reactive({})

const testing = ref(false)
const saving = ref(false)
const testResult = ref(null)    // { ok: true } 或 { ok: false, reason }
const saveSuccess = ref(false)
const error = ref('')

function reset() {
  enabled.value = !!props.provider.enabled
  sortOrder.value = props.provider.sort_order
  for (const f of (props.provider.schema?.fields || [])) {
    if (f.sensitive) {
      formValues[f.key] = ''   // 始终留空,placeholder 显示 masked
    } else {
      formValues[f.key] = props.provider.config?.[f.key] ?? (f.default ?? '')
    }
  }
  testResult.value = null
  error.value = ''
}

watch(() => props.provider, reset, { immediate: true })

function maskedHint(field) {
  if (!field.sensitive) return ''
  return props.provider.config?.[`${field.key}_masked`] || ''
}

function buildConfigPayload() {
  const out = {}
  for (const f of (props.provider.schema?.fields || [])) {
    const v = formValues[f.key]
    if (f.sensitive) {
      // 空字符串视为不修改
      if (typeof v === 'string' && v.length > 0) out[f.key] = v
    } else {
      out[f.key] = v
    }
  }
  return out
}

async function doTest() {
  testing.value = true
  testResult.value = null
  error.value = ''
  try {
    const t = localStorage.getItem('admin_token') || ''
    const res = await fetch(`${props.apiBase}/admin/oauth/providers/${props.provider.provider}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: buildConfigPayload() })
    })
    const data = await res.json()
    testResult.value = data
  } catch (e) {
    testResult.value = { ok: false, reason: e.message || '网络错误' }
  } finally {
    testing.value = false
  }
}

async function doSave() {
  saving.value = true
  error.value = ''
  saveSuccess.value = false
  try {
    const t = localStorage.getItem('admin_token') || ''
    const res = await fetch(`${props.apiBase}/admin/oauth/providers/${props.provider.provider}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: enabled.value,
        sort_order: Number(sortOrder.value),
        config: buildConfigPayload(),
      })
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || '保存失败'
      return
    }
    saveSuccess.value = true
    // 3 秒后自动隐藏(父组件 emit('updated') 后会重新加载,但提示先显示给用户)
    setTimeout(() => { saveSuccess.value = false }, 3000)
    emit('updated')
  } catch (e) {
    error.value = e.message || '网络错误'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-6 mb-4">
    <!-- 顶部 -->
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-lg font-semibold text-text">{{ provider.display_name }}</h3>
      <!-- 显眼的 toggle 开关 -->
      <label class="inline-flex items-center gap-3 cursor-pointer select-none">
        <span :class="enabled ? 'text-emerald-600 font-medium' : 'text-text-secondary'" class="text-sm">
          {{ enabled ? '已启用' : '已禁用' }}
        </span>
        <span class="relative inline-block w-10 h-6">
          <input type="checkbox" v-model="enabled" class="peer sr-only" />
          <span class="absolute inset-0 rounded-full bg-gray-300 peer-checked:bg-emerald-500 transition-colors"></span>
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
        </span>
      </label>
    </div>

    <!-- 启用/禁用 副提示 — 告知联动效果 -->
    <p class="text-xs text-text-secondary mb-5">
      <template v-if="enabled">
        启用后,登录页会显示「{{ provider.display_name }}」入口;<span class="text-amber-600">同时关闭自助注册</span>(新用户由管理员添加或扫码后自动创建)
      </template>
      <template v-else>
        禁用后,登录页不显示「{{ provider.display_name }}」入口
      </template>
    </p>

    <!-- 表单 -->
    <div class="space-y-4">
      <div v-for="f in (provider.schema?.fields || [])" :key="f.key">
        <label class="block text-sm text-text-secondary mb-1">
          {{ f.label }} <span v-if="f.required" class="text-red-500">*</span>
        </label>
        <input
          v-if="f.type === 'text' || f.type === 'password'"
          v-model="formValues[f.key]"
          :type="f.type === 'password' ? 'password' : 'text'"
          :placeholder="f.sensitive ? (maskedHint(f) || '请输入') : '请输入'"
          class="w-full px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text"
        />
        <label v-else-if="f.type === 'boolean'" class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="formValues[f.key]" /> {{ f.description || f.label }}
        </label>
        <p v-if="f.sensitive" class="text-xs text-text-secondary mt-1">
          留空表示不修改,已保存的值仅展示末四位
        </p>
      </div>

      <div>
        <label class="block text-sm text-text-secondary mb-1">排序(值越小越靠前)</label>
        <input v-model="sortOrder" type="number"
          class="w-32 px-3 py-2 border border-[rgba(0,0,0,0.08)] rounded-lg text-sm focus:outline-none focus:border-text" />
      </div>
    </div>

    <!-- 提示 -->
    <p v-if="error" class="text-sm text-red-500 mt-4">{{ error }}</p>
    <p v-if="saveSuccess" class="text-sm text-emerald-600 mt-4">✅ 保存成功</p>
    <p v-if="testResult?.ok === true" class="text-sm text-emerald-600 mt-4">✅ 测试成功:已获取 access_token</p>
    <p v-if="testResult?.ok === false" class="text-sm text-red-500 mt-4">❌ 测试失败:{{ testResult.reason }}</p>

    <!-- 按钮组 -->
    <div class="flex items-center justify-between mt-6">
      <p class="text-xs text-text-secondary">
        上次保存:{{ provider.updated_at ? new Date(provider.updated_at).toLocaleString() : '从未' }}
      </p>
      <div class="flex gap-2">
        <button @click="doTest" :disabled="testing"
          class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary disabled:opacity-50">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button @click="reset"
          class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.08)] rounded-lg hover:bg-surface-secondary">
          重置
        </button>
        <button @click="doSave" :disabled="saving"
          class="px-4 py-2 text-sm bg-text text-white rounded-lg hover:opacity-80 disabled:opacity-50">
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
      </div>
    </div>
  </div>
</template>
