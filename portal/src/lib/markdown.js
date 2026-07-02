// Markdown 渲染工具
// - 解析 frontmatter（id/label/order/description）
// - markdown-it + anchor + highlight.js
// - 解析时同步抽取 h2/h3 作为 TOC,在 DocsView 右侧栏展示
// - 自动给 ```mermaid 代码块加 .mermaid class,由 DocsView 调用 mermaid.run() 渲染
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import hljs from 'highlight.js/lib/common'

// 简易 frontmatter 解析（YAML 子集：key: value），避免再引一个依赖
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (/^-?\d+$/.test(v)) v = parseInt(v, 10)
    data[m[1]] = v
  }
  return { data, content: match[2] }
}

// 工厂模式：每次渲染都新建一个 md 实例 + 收集器，避免并发/复用时 toc 串场
function createRenderer() {
  const toc = []
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    highlight(str, lang) {
      if (lang === 'mermaid') {
        return `<pre class="mermaid">${md.utils.escapeHtml(str)}</pre>`
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code class="language-${lang}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
        } catch (_) { /* fallthrough */ }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
    }
  })

  md.use(anchor, {
    slugify: s => encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')),
    // anchor 给每个 heading 加完 id 后回调,这里把 h2/h3 抽到 toc
    callback(token, info) {
      const level = parseInt(token.tag.slice(1), 10) // h1→1, h2→2, h3→3
      if (level === 2 || level === 3) {
        toc.push({ level, text: info.title, slug: info.slug })
      }
    }
  })

  return { md, toc }
}

export function renderMarkdown(raw) {
  const { data, content } = parseFrontmatter(raw)
  const { md, toc } = createRenderer()
  const html = md.render(content)
  return { data, html, toc }
}

// 启动时一次性加载所有章节
// group 字段可选:有则按组归类,没有的归到默认组「其他」
// 输出顺序:组按 GROUP_ORDER 排,组内按 order 排
const GROUP_ORDER = ['入门', '使用指南', '客户端对接', '进阶', '其他']
const groupRank = (g) => {
  const i = GROUP_ORDER.indexOf(g)
  return i === -1 ? GROUP_ORDER.length : i
}

export function loadAllChapters() {
  const modules = import.meta.glob('../docs/*.md', { query: '?raw', import: 'default', eager: true })
  const chapters = []
  for (const [path, raw] of Object.entries(modules)) {
    const { data, html, toc } = renderMarkdown(raw)
    if (!data.id) continue
    chapters.push({
      id: data.id,
      label: data.label || data.id,
      order: typeof data.order === 'number' ? data.order : 999,
      group: data.group || '其他',
      description: data.description || '',
      html,
      toc,
      path
    })
  }
  chapters.sort((a, b) => {
    const r = groupRank(a.group) - groupRank(b.group)
    return r !== 0 ? r : a.order - b.order
  })
  return chapters
}
