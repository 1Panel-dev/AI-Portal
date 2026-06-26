# AI-Portal — Portal

AI-Portal 前端，基于 Vue 3 + Vite + Tailwind CSS。

## 开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产出到 portal/dist/
```

开发时需后端在 `http://localhost:3002` 运行。后端项目在 `../server`。

## 目录

| 路径 | 说明 |
|------|------|
| `src/views/` | 页面（18 个） |
| `src/components/` | 通用组件 |
| `src/composables/` | 状态与数据加载 |
| `src/docs/` | 帮助文档（Markdown） |
| `public/docs/img/` | 文档配图 |

## 路由

定义在 `src/main.js`，`requiresAuth` / `requiresUserAuth` 守卫控制访问权限。
