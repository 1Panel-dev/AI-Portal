---
id: models
label: 模型广场
order: 3
group: 使用指南
description: 浏览所有可用的 AI 模型，一键复制模型名称和调用地址。
---

# 模型广场

首页即是模型广场，你可以：

- 按供应商筛选模型
- 搜索关键词快速定位
- 点击「复制」获取模型名称
- 查看调用示例，复制 curl 命令

> ⚠️ **调用模型前必读**：需要先**注册账号**并**创建 API Key** 才能调用模型。点击首页的「申请 API Key 快速体验」按钮可直接前往注册。

![模型广场顶部横幅 + 搜索栏](/docs/img/models-hero.png)

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
