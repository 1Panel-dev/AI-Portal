---
id: workbuddy
label: WorkBuddy 对接
order: 10
group: 客户端对接
description: 将 AI 门户的模型接入 WorkBuddy 全能 AI 工作台。
---

# WorkBuddy 对接

[WorkBuddy](https://copilot.tencent.com/work/) 是全能 AI 工作台，一人指挥，全行业专家执行，从策略到交付一站搞定。

- **免部署·安装即用**
- **多专家·多模型协同**
- **全平台·桌面 / 主流 IM / 小程序**

将 AI 门户的模型接入 WorkBuddy 后，可在 WorkBuddy 中直接调用网关下的所有模型，并与其内置的多专家协同能力配合使用。

## 准备三项参数

对接前先准备好以下三项，后续配置时直接填入：

- **Base URL**：`<your-gateway-url>/v1`
- **API Key**：在「个人中心 → API Key 管理」中创建后复制
- **Model**：从模型广场卡片上「复制」拿到的模型名

> 💡 **提示**：如果还没注册账号或没创建 API Key，先看「快速开始」和「个人中心」章节完成准备。

## 添加模型配置

**Step 1**：打开 WorkBuddy 的模型设置入口。

![WorkBuddy 模型设置入口](/docs/img/workbuddy-step1-open-settings.png)

**Step 2**：新增一个模型提供商，类型选择 OpenAI 兼容接口。

![新增模型提供商](/docs/img/workbuddy-step2-add-provider.png)

**Step 3**：填写上方「准备三项参数」里的 Base URL、API Key、模型名，保存配置。

![填写 Base URL / API Key / Model](/docs/img/workbuddy-step3-fill-config.png)

## 验证模型

**Step 4**：在对话窗口选择刚才添加的模型。

![选择 AI 门户模型](/docs/img/workbuddy-step4-select-model.png)

**Step 5**：随便发一句话，能正常收到回复即说明对接成功。

![对话验证成功](/docs/img/workbuddy-step5-verify-chat.png)

## 常见错误

- **401 Unauthorized** — API Key 复制时带了空格，或已在「个人中心」重置过 Key
- **404 Not Found** — Base URL 末尾缺 `/v1`，或模型名拼错
