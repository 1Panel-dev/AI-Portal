## v1.0.4

### ✨ New Features / 新增功能

- **AdminStats**: Added data statistics dashboard with trend charts, leaderboard (Top 10 / Bottom 10), and model distribution / 管理后台新增数据统计页面，支持趋势图、红黑榜、模型分布 by @fit2cloudzhao
- **ProfileView**: Added per-user usage statistics view with monthly filtering and token breakdown / 用户维度新增用量统计视图，支持月份筛选和 Token 用量明细 by @fit2cloudzhao
- **Skillctl**: Replaced hardcoded install token with dynamic value fetched from 1Panel / skillctl 安装 token 从硬编码改为通过 1Panel 动态获取 by @fit2cloudzhao
- **Tokens**: Added token usage statistics tracking / 新增 Token 用量统计 by @fit2cloudzhao
- **Skills**: Added skill version history / 技能新增版本历史记录 by @fit2cloudzhao

### ⚙️ Enhancements / 功能优化

- **Base Path**: Refactored BASE_PATH prefix handling to support sub-path deployment / BASE_PATH 前缀统一剥离，支持子路径部署 by @fit2cloudzhao
- **User Sync**: Refactored to async task mode, avoiding timeout on large user bases / 用户同步改为异步任务模式，避免大批量超时 by @fit2cloudzhao
- **Display Name**: Added Chinese display name support extracted from 1Panel / 用户列表支持中文名展示 by @fit2cloudzhao
- **Charts**: Enhanced trend chart hover tooltip with input/output/cache/total breakdown / 趋势图 hover 显示输入/输出/缓存/总量明细 by @fit2cloudzhao
- **Month Selector**: Replaced dropdown with custom scroll panel in stats pages / 统计页面月份选择器改为自定义滚动面板 by @fit2cloudzhao

### 🛠️ Bug Fixes / 问题修复

- **DocsView**: Fixed image paths not adapting to BASE_PATH sub-path deployment / 修复在线文档图片路径在子路径部署下失效 by @fit2cloudzhao
- **Sync**: Fixed user sync case-sensitivity issue / 修复用户同步区分大小写问题 by @fit2cloudzhao
- **Deploy**: Added SELinux `:z` label to Docker volume mount for CentOS compatibility / Docker Compose volume 加 SELinux 标签，兼容 CentOS 环境 by @fit2cloudzhao
