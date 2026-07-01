<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Lock, ShieldCheck, AlertTriangle, Link } from 'lucide-vue-next'
import NavBar from '../components/NavBar.vue'
import OAuthProviderCard from '../components/admin/OAuthProviderCard.vue'
import { API_BASE } from '../lib/apiBase.js'

const router = useRouter()

const providers = ref([])
const loading = ref(true)

const currentHost = computed(() => window.location.host)
const anyEnabled = computed(() => providers.value.some(p => p.enabled))

// 后端推导的回调 URL 用同样的规则在前端展示给管理员对照
// (前端不影响后端实际拼接,这里只是显示用)
const callbackUrl = computed(() => {
  return `${window.location.protocol}//${window.location.host}${API_BASE}/auth/oauth/wecom/callback`
})

const copyHint = ref('')
async function copyCallbackUrl() {
  try {
    await navigator.clipboard.writeText(callbackUrl.value)
    copyHint.value = '已复制'
    setTimeout(() => { copyHint.value = '' }, 2000)
  } catch {
    copyHint.value = '复制失败,请手动选择'
    setTimeout(() => { copyHint.value = '' }, 2000)
  }
}

async function load() {
  loading.value = true
  try {
    const token = localStorage.getItem('admin_token')
    if (!token) {
      router.push('/admin/login')
      return
    }
    const res = await fetch(`${API_BASE}/admin/oauth/providers`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 401 || res.status === 403) {
      router.push('/admin/login')
      return
    }
    const data = await res.json()
    providers.value = data.providers || []
  } catch (e) {
    console.error('load providers failed:', e)
  } finally {
    loading.value = false
  }
}

function logout() {
  localStorage.removeItem('admin_token')
  router.push('/admin/login')
}

onMounted(load)
</script>

<template>
  <div class="relative z-10 min-h-screen">
    <NavBar />

    <main class="max-w-[1000px] mx-auto px-6 py-10 pt-[132px]">
      <!-- Admin Nav -->
      <div class="flex items-center gap-4 mb-6">
        <button
          @click="$router.push('/admin')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          审核管理
        </button>
        <button
          @click="$router.push('/admin/skills')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/skills' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          技能管理
        </button>
        <button
          @click="$router.push('/admin/users')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/users' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          用户管理
        </button>
        <button
          @click="$router.push('/admin/config')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/config' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          系统配置
        </button>
        <button
          @click="$router.push('/admin/oauth')"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all"
          :class="$route.path === '/admin/oauth' ? 'bg-accent text-white' : 'bg-white border border-[rgba(0,0,0,0.06)] hover:border-text'"
        >
          第三方登录
        </button>
      </div>

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text">第三方登录</h1>
          <p class="text-text-secondary text-sm mt-1">
            配置企业微信等第三方账号扫码登录
          </p>
        </div>
        <button
          @click="logout"
          class="px-4 py-2 text-sm border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary transition-all"
        >
          退出登录
        </button>
      </div>

      <!-- 自助注册联动状态 -->
      <div v-if="!loading"
        class="rounded-xl p-4 mb-4 border"
        :class="anyEnabled
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'">
        <p class="text-sm flex items-start gap-2">
          <component :is="anyEnabled ? Lock : ShieldCheck" class="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <template v-if="anyEnabled">
              当前已启用第三方登录,<span class="font-medium">自助注册接口已自动关闭</span>。
              新用户由管理员在「用户管理」中添加,或在首次扫码后通过「跳过绑定」自动创建。
            </template>
            <template v-else>
              当前未启用任何第三方登录,<span class="font-medium">自助注册接口正常开放</span>。
              一旦启用任一登录方式,自助注册会自动关闭。
            </template>
          </span>
        </p>
      </div>

      <!-- 可信域名提示 -->
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div class="flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <p class="font-medium text-text mb-1">启用前必读:可信域名与可信 IP 配置</p>
            <p class="text-text-secondary mb-2">当前部署域名:<span class="font-mono">{{ currentHost }}</span></p>
            <p class="text-text-secondary">
              请在企业微信后台 → 应用管理 → 进入企业微信应用 → 「<span class="font-medium">网页授权及 JS-SDK</span>」,完成以下配置:
            </p>
            <ol class="list-decimal ml-5 mt-1 text-text-secondary space-y-1">
              <li>
                <span class="font-medium">可信域名</span>:把 <span class="font-mono">{{ currentHost }}</span> 加入,
                并完成域名所有权校验(下载 <span class="font-mono">WW_verify_xxx.txt</span> 放到根路径)
              </li>
              <li>
                <span class="font-medium">可信 IP</span>:把服务器的出口 IP 加入(用于保障回调请求来源可信)
              </li>
            </ol>
          </div>
        </div>
      </div>

      <!-- 回调地址(只读 + 可复制) -->
      <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 mb-6">
        <div class="flex items-start gap-3">
          <Link class="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <p class="font-medium text-text mb-1">OAuth 回调地址(自动生成,无需填写)</p>
            <p class="text-text-secondary mb-2">企业微信扫码完成后,会回调到此地址。系统根据当前部署域名自动推导,管理员一般无需关心。</p>
            <div class="flex items-center gap-2">
              <input
                :value="callbackUrl"
                readonly
                class="flex-1 px-3 py-2 bg-surface-secondary border border-[rgba(0,0,0,0.06)] rounded-lg text-xs font-mono text-text"
                @focus="$event.target.select()"
              />
              <button
                @click="copyCallbackUrl"
                class="px-3 py-2 text-xs border border-[rgba(0,0,0,0.06)] rounded-lg hover:bg-surface-secondary whitespace-nowrap"
              >
                {{ copyHint || '复制' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-text-secondary">
        加载中...
      </div>

      <div v-else>
        <OAuthProviderCard
          v-for="p in providers" :key="p.provider"
          :provider="p" :api-base="API_BASE"
          @updated="load"
        />
      </div>
    </main>
  </div>
</template>
