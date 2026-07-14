### ✨ New Features / 新增功能

- **Skill detail skillctl dynamic endpoint**: skillctl login command in skill card detail modal and detail page now auto-replaces `<1Panel地址>` with configured panel_base_url / 技能卡片详情弹窗和详情页的 skillctl 登录命令自动替换 1Panel 端点地址 by @fit2cloudzhao
- **Skill detail skillctl token auto-fill**: when logged in and skillctl token exists, the login command in detail modal/page auto-fills the real token for one-click copy / 登录后自动预填 skillctl token，支持一键复制完整命令 by @fit2cloudzhao
- **Windows skillctl zip package**: Windows platform now uses ZIP package with PowerShell installer and README / Windows 平台改用 ZIP 包发布，内置安装脚本 by @fit2cloudzhao

### ⚙️ Enhancements / 功能优化

- **Version list lazy loading**: version history in skill detail modal adds 200ms loading delay to avoid UI flash; same-skill version data cached across opens / 版本历史延迟加载，避免快响应闪烁，同技能缓存不重复请求 by @fit2cloudzhao
- **SkillctlGuide admin gating**: SkillctlGuide in profile center now hidden for admin users (admins have no skillctl token) / 个人中心 SkillctlGuide 仅对普通用户展示 by @fit2cloudzhao

### 🛠️ Bug Fixes / 问题修复

- **syncModelsFromPanel modelMap parsing**: added defensive parsing for modelMap from 1Panel to prevent sync interruption from malformed data / 解析 1Panel 返回的 modelMap 增加容错处理 by @fit2cloudzhao
