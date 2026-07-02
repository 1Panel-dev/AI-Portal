---
id: integrations
label: AI 网关对接指南
order: 2
group: 客户端对接
description: 将 AI 门户的模型接入 Codex、Claude Code 等客户端（WorkBuddy 对接见独立章节）。
---

# AI 网关对接指南

将 AI 门户的 AI 模型接入各类客户端工具。以下示例统一使用：

- **Base URL**：`<your-gateway-url>/v1`
- **API Key**：在「个人中心 → API Key 管理」中创建后复制
- **Model**：从模型广场卡片上「复制」拿到的模型名

## 前置步骤

按以下步骤准备好账号和 API Key 后，再进入下方任一客户端的对接小节。

### 1. 注册账号

点击右上角「登录」→「注册账号」，填写用户名和密码即可完成注册。

![登录/注册入口在导航栏右上角](/docs/img/quickstart-register-entry.png)

### 2. 申请 API Key

登录后进入「个人中心」→「API Key 管理」创建 Key，用于调用 AI 模型。

![用户下拉菜单中的「个人中心」与「API Key 管理」入口](/docs/img/quickstart-user-menu.png)

### 3. 选择模型

进入「模型广场」找到要使用的模型，点击卡片上的「复制」获取模型名称。

> 💡 **提示**：上文提到的 Base URL、API Key、模型名是后续所有客户端对接都会用到的三项参数。建议先在文本编辑器里集中粘贴一份，避免反复切换页面。

## WorkBuddy

WorkBuddy 的对接步骤已独立成一章，详见 [WorkBuddy 对接](?chapter=workbuddy)。

## CC Switch（Codex / Claude Code 的前置工具）

[CC Switch](https://github.com/farion1231/cc-switch) 是一款桌面应用，作为本地代理网关统一管理 Claude Code、Codex 等 AI 编程工具的 API 配置，核心作用是**一键切换供应商、路由转发**，避免手动修改各客户端的配置文件。

**支持的工具**：Claude Code、Codex CLI、Gemini CLI、OpenCode、Hermes Agent 等。

### 工作原理

CC Switch 在请求链路中充当**本地代理网关**（默认监听 `127.0.0.1:15721`），客户端的请求先到它这里，再由它根据当前激活的 Provider 转发到目标 API。

```plain
客户端（Claude Code / Codex / Gemini CLI）
        │  发起原生协议请求
        ▼
CC Switch 本地代理（127.0.0.1:15721）
        │  ├─ 匹配路由规则（当前激活的 Provider）
        │  ├─ 协议转换（Anthropic ↔ OpenAI 兼容格式）
        │  ├─ 替换 API Key
        │  └─ 处理流式响应（SSE / JSON）
        ▼
目标 API 供应商
        ├─ 1Panel AI 门户
        ├─ Anthropic 官方
        ├─ OpenAI 官方
        └─ 第三方中转站 / 国产大模型
```

![CC Switch 架构示意图](/docs/img/ccswitch-arch.svg)

> ⚠️ **重要**：CC Switch 必须**保持后台运行**，关闭后 CLI 工具将无法发出 API 请求。

### 安装 CC Switch

前往 GitHub Releases 下载对应系统版本：[https://github.com/farion1231/cc-switch/releases](https://github.com/farion1231/cc-switch/releases)

| 系统 | 推荐包 |
| --- | --- |
| Windows | `CC-Switch-v3.16.1-Windows.msi` |
| macOS | `CC-Switch-v3.16.1-macOS.dmg` |
| Linux | `CC-Switch-v3.16.1-Linux.deb` |

**Windows 安装**

1. 双击 `.msi` 文件
2. 若弹出 SmartScreen 拦截 → 点击「更多信息」→「仍要运行」
3. 安装路径**不要含中文**
4. 安装完成后系统托盘出现 CC Switch 图标

**macOS 安装**

```bash
# 方式一：Homebrew（推荐）
brew tap farion1231/ccswitch
brew install --cask cc-switch

# 方式二：手动安装 dmg，拖入应用程序
# 首次打开若提示「无法验证开发者」：
# 系统设置 → 隐私与安全性 → 点击「仍要打开」
```

CC Switch 安装完成后，下面分别接入 Codex 和 Claude Code。

## Codex

在 CC Switch 中为 Codex 添加 1Panel AI 门户这个 Provider。

**Step 1**：打开 CC Switch，点击右上角 **+** 新增 Provider。

![CC Switch 添加 Provider 入口](/docs/img/codex-step1-add.png)

**Step 2**：填写本指南顶部的三项参数 —— 名称、API Key、Base URL，API 格式选择 `OpenAI Chat Completions`。

![填写 Provider 表单](/docs/img/codex-step2-form.png)

**Step 3**：点击「获取模型列表」拉取 AI 门户已开通的模型，选择默认模型与兜底模型。

![获取模型列表并选择](/docs/img/codex-step3-models.png)

**Step 4 ~ 6**：测试连通、启用 Provider、开启路由勾选 **Codex** —— 操作与下方 Claude Code 的 Step 4 ~ 6 完全一致，可参考对应截图。

## Claude Code

在 CC Switch 中为 Claude Code 添加 1Panel AI 门户这个 Provider。

**Step 1**：打开 CC Switch，点击右上角 **+** 新增 Provider。

![CC Switch 添加 Provider 入口](/docs/img/ccswitch-step1-add.png)

**Step 2**：填写以下信息。

| 字段 | 填写内容 |
| --- | --- |
| 名称 | `AI-Portal`（或自定义） |
| API Key | 在「个人中心 → API Key 管理」中创建后复制 |
| Base URL | `<your-gateway-url>/v1` |
| API 格式 | `OpenAI Chat Completions`（务必选择此项） |
| 默认模型 | 见 Step 3 |
| 默认兜底模型 | 见 Step 3，**必须配置** |

![填写 Provider 表单](/docs/img/ccswitch-step2-form.png)

**Step 3**：点击「获取模型列表」拉取 AI 门户已开通的模型，选择默认模型与兜底模型。

![获取模型列表并选择](/docs/img/ccswitch-step3-models.png)

**Step 4**：点击「测试」验证连通性。

![测试连通](/docs/img/ccswitch-step4-test.png)

**Step 5**：在供应商列表中点击该条目的「启用」。

![启用 Provider](/docs/img/ccswitch-step5-enable.png)

**Step 6**：开启路由，勾选要走 AI 门户的客户端工具（Claude Code / Codex 等）。

![开启路由勾选](/docs/img/ccswitch-step6-routes.png)

## 注意事项

> ⚠️ **CC Switch 必须保持运行**：关闭后所有客户端将无法调用 API。可最小化到系统托盘后台运行，但不要退出。
>
> ⚠️ **修改配置后需重启客户端**：在 CC Switch 中切换模型、修改 Provider 后，必须重启 Claude Code 或 Codex，否则不生效。

### 常见错误

- **401 Unauthorized** — API Key 复制时带了空格，或已在「个人中心」重置过 Key
- **404 Not Found** — Base URL 末尾缺 `/v1`，或模型名拼错
- **Connection refused** — CC Switch 未启动；或本地代理端口（默认 15721）被占用