---
id: models
label: 模型广场
order: 3
group: 使用指南
description: 浏览所有可用的 AI 模型，一键复制模型名称和调用地址。
---

# 模型广场

首页即是模型广场，你可以：

- 按**标签**筛选模型（左侧栏，点击标签名切换）
- 按**供应商**筛选模型
- 搜索关键词快速定位
- 点击「复制」获取模型名称
- 点击卡片展开详情抽屉，查看调用方式与 curl 示例

> ⚠️ **调用模型前必读**：需要先**注册账号**并**创建 API Key** 才能调用模型。点击首页的「申请 API Key 快速体验」按钮可直接前往注册。

![模型广场顶部横幅 + 搜索栏](/docs/img/models-hero.png)

## 标签筛选

页面左侧为标签栏，展示当前可见模型适用的标签及数量。点击标签名即可只看带有该标签的模型，再次点击取消筛选。管理员在后台为模型打的标签会同步展示在这里。

## 模型详情抽屉

点击任意模型卡片，右侧会展开详情抽屉，包含：

- 模型的上下文窗口、最大输出等规格
- 能力标签（多模态 / 工具调用 / 图片输入 / 缓存）
- **调用方式选项卡**：模型支持的每种调用方式（如 Chat Completions、Embeddings 等）各占一个选项卡，选中后展示对应的调用地址与完整 curl 示例，可直接复制

## 调用示例

以兼容 OpenAI 协议的接口为例：

```bash
curl https://<your-gateway-url>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "复制自模型广场的模型名",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

> 💡 **提示**：调用模型需要先注册并创建 API Key。点击首页的「申请 API Key 快速体验」按钮可直接前往注册。
