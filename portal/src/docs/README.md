# 在线文档源文件

本目录的 `*.md` 文件是「在线文档」页面（`/docs`）的真实内容来源，构建时由 Vite 通过
`import.meta.glob` 全部读入，运行时由 `src/lib/markdown.js` 解析并渲染。

> 注意：本 `README.md` **不会**出现在文档页（没有 frontmatter id 的 .md 会被跳过）。

## 怎么加一个新章节？

1. 在本目录新建文件，文件名建议 `NN-slug.md`（前缀数字仅用于本地排序观感，真正的排序看 frontmatter `order`）。
2. 文件头加 frontmatter：

   ```markdown
   ---
   id: profile
   label: 个人中心
   order: 5
   description: 一句话副标题（H1 下方灰字）
   ---
   ```

   - `id` —— 章节唯一标识，URL 锚也用它（必填）
   - `label` —— 左侧导航显示文字（必填）
   - `order` —— 排序，越小越靠前
   - `description` —— H1 标题下方的灰色描述

3. 正文用纯 Markdown。无需改任何 `.js`/`.vue` 文件，刷新即可看到新章节。

## 支持的语法

| 语法 | 用法 |
|---|---|
| 标题 | `# / ## / ###`（自动生成锚点） |
| 列表 | `- ...` / `1. ...` |
| 强调 | `**粗体**` / `*斜体*` |
| 代码块 | ` ```bash ` 等，自动语法高亮 |
| 行内代码 | `` `code` `` |
| 引用块 | `> ...`（用作提示/警告，前面可加 emoji） |
| 链接 | `[文字](url)`，URL 自动 linkify |
| 图片 | `![alt](/docs/img/xxx.png)` |
| 表格 | 标准 GitHub 风 |
| Mermaid | ` ```mermaid ` 代码块 |

## 图片放哪？

放 `public/docs/img/`，在 .md 里用绝对路径引用：

```markdown
![注册按钮位置](/docs/img/register-button.png)
```

`public/` 下的资源会被原样拷贝到构建产物根目录，BASE_PATH 由后端注入的 `<base href>` 自动处理。

## 截图位占位约定

迁移期还没截图的地方，统一写：

```markdown
> 📷 **截图位**：注册按钮位置 — 待补充 `/docs/img/register-button.png`
```

页面上会显示为一段灰色引用块，提示后续补图。补图后把整段换成 `![alt](路径)` 即可。

## 提示/警告块

用引用块加 emoji 表达，统一风格：

```markdown
> ⚠️ **注意**：每人只能拥有一个活跃的 API Key。
> 💡 **提示**：调用模型前需要先创建 API Key。
> 📷 **截图位**：xxx 位置 — 待补充。
```

## 改完要重新构建吗？

是的。文档随前端打包进容器镜像，改完需要 `docker build` 才会生效。本地开发用 `npm run dev` 热更新可即时预览。
