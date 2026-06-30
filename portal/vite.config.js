import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 把 index.html 里的 __BASE_PATH__ 占位符在 dev 阶段都替换成 '/'
// 生产容器里由 Express 启动时按真实 BASE_PATH 再做替换,这里只解决本地 dev
// 场景:本地 dev 不走后端中间件,占位符保留会让 <base href="__BASE_PATH__"> 把
// 所有相对路径都解析到 http://host:port/__BASE_PATH__/...,SPA 路由全炸。
// 同时填上站点品牌的 dev 默认值(站名/logo/favicon),生产由后端从 system_config 注入。
const DEV_BRANDING_JSON = JSON.stringify({
  site_name: 'AI-Portal',
  site_logo: '',
  site_favicon: '',
})
const replaceBasePath = {
  name: 'dev-replace-base-path',
  transformIndexHtml(html) {
    return html
      .split('__BASE_PATH__').join('/')
      .split('__SITE_NAME__').join('AI-Portal')
      .split('__SITE_BRANDING_JSON__').join(DEV_BRANDING_JSON)
  },
  apply: 'serve', // 仅在 vite dev 时生效;build 产物保留占位符,留给后端运行时替换
}

export default defineConfig({
  plugins: [vue(), replaceBasePath],
  // 资源用相对路径(./assets/xxx),让 nginx 加任何前缀都能正确解析
  // 配合 index.html 里的 <base href> 由后端运行时注入
  base: './',
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 拆出 vue / vue-router 为独立 vendor chunk，长期缓存命中率更高
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router'],
        },
      },
    },
  },
})
