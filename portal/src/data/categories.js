export const categoryLabels = {
  skill: '技能',
  package: '技能包',
  all: '全部',
}

export const categories = [
  { id: 'all', name: '全部' },
  { id: 'skill', name: '技能' },
  { id: 'package', name: '技能包' },
]

export const sources = [
  { id: 'all', name: '全部' },
  { id: 'local', name: '本地' },
  { id: 'panel', name: '1Panel' },
]

// 供应商中文名映射(与后端 portal.js PROVIDER_LABELS 保持同步)
export const providerLabels = {
  deepseek: '深度求索',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  zhipu: '智谱 AI',
  qwen: '阿里云百炼',
  ark: '火山方舟',
  'ark-coding-plan': '火山方舟',
  vllm: 'vLLM',
  custom: '自定义',
}

export const sorts = [
  { id: 'default', name: '综合排序' },
  { id: 'downloads', name: '下载最多' },
  { id: 'latest', name: '最新发布' },
  { id: 'stars', name: '评分最高' },
]

export const avatarColors = {
  'av-blue': { bg: '#e3f2fd', text: '#1565c0' },
  'av-purple': { bg: '#f3e5f5', text: '#7b1fa2' },
  'av-green': { bg: '#e8f5e9', text: '#2e7d32' },
  'av-amber': { bg: '#fff8e1', text: '#f57f17' },
  'av-pink': { bg: '#fce4ec', text: '#c62828' },
  'av-teal': { bg: '#e0f2f1', text: '#00695c' },
  'av-orange': { bg: '#fff3e0', text: '#e65100' },
  'av-red': { bg: '#ffebee', text: '#c62828' },
}

export const tagMap = {
  automation: { label: 'automation' },
  ai: { label: 'AI' },
  data: { label: 'data' },
}
