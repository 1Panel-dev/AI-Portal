### ✨ New Features / 新增功能

- **skillctl 动态替换 1Panel 端点**：技能卡片详情弹窗和技能详情页的 skillctl 登录命令中，`<1Panel地址>` 会自动替换为系统配置的 panel_base_url，无需手动填写 by @fit2cloudzhao
- **skillctl Token 动态替换**：登录后若已生成 skillctl token，卡片详情弹窗和详情页的登录命令会自动预填 token 值，一键复制完整命令 by @fit2cloudzhao
- **Windows skillctl 安装优化**：Windows 平台改用 ZIP 包发布，内置 PowerShell 安装脚本和 README by @fit2cloudzhao

### ⚙️ Enhancements / 功能优化

- **版本历史延迟加载**：技能卡片详情弹窗中版本历史添加 200ms 延迟加载态，避免快响应时的 UI 闪烁；同一技能版本列表缓存不重复请求 by @fit2cloudzhao
- **个人中心 SkillctlGuide 仅对普通用户展示**：管理员不显示 CLI 工具区（管理员无 skillctl token） by @fit2cloudzhao

### 🛠️ Bug Fixes / 问题修复

- **syncModelsFromPanel 容错**：解析 1Panel 返回的 modelMap 时增加容错处理，防止异常数据导致同步中断 by @fit2cloudzhao
