<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const REASON_TEXT = {
  state_invalid: '登录请求已过期,请重新发起扫码',
  exchange_failed: '与企业微信通信失败,请稍后重试或联系管理员',
  provider_disabled: '该登录方式已被管理员暂时关闭',
  not_allowed: '您还未被授权使用此登录方式,请联系管理员',
  already_bound: '该企业微信账号已被其他用户绑定,无法重复绑定',
  feature_not_ready: '该功能尚未上线',
  account_disabled: '您的账号已被禁用,请联系管理员',
}

const message = computed(() => REASON_TEXT[route.query.reason] || '未知错误,请重试')
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div class="text-center max-w-md px-6">
      <h2 class="text-xl font-semibold text-text mb-3">登录失败</h2>
      <p class="text-sm text-text-secondary mb-6">{{ message }}</p>
      <router-link to="/login" class="inline-block px-5 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover">
        返回登录页
      </router-link>
    </div>
  </div>
</template>
