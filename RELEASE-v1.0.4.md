### ✨ New Features / 新增功能

- **Data statistics dashboard**: admin panel now includes data statistics page with ECharts trend charts, top/bottom user rankings, model usage breakdown, and month filtering / 管理后台新增数据统计页面，包含 ECharts 趋势图、用户红黑榜、模型用量分布和月份筛选 by @fit2cloudzhao
- **Profile usage statistics**: personal center adds usage statistics with trend charts, token consumption tracking, dual Y-axis for request count / 个人中心新增用量统计图表，Token 消耗趋势、请求次数、Y 轴标签和图例 by @fit2cloudzhao
- **Skillctl dynamic endpoint & token**: skill card detail modal and detail page auto-replaces 1Panel endpoint in skillctl login command; auto-fills skillctl token for one-click copy / 技能卡片详情的 skillctl 登录命令动态替换 1Panel 地址和 token，支持一键复制 by @fit2cloudzhao
- **Windows skillctl ZIP package**: Windows platform now distributes as ZIP with bundled PowerShell installer and README / Windows 平台 skillctl 改用 ZIP 包发布，内置 PowerShell 安装脚本 by @fit2cloudzhao
- **Skill version history**: skill marketplace now displays full version history with download per version / 技能市场新增版本历史列表，支持按版本下载 by @fit2cloudzhao
- **Download logging**: skill download now logs user_id and client IP / 技能下载日志新增 user_id + IP 记录 by @fit2cloudzhao
- **Async user sync**: user synchronization from 1Panel now runs as async task to avoid blocking / 用户同步改为异步任务模式 by @fit2cloudzhao
- **Chinese display name from 1Panel**: extract user Chinese name from 1Panel description field / 从 1Panel description 字段提取用户中文名 by @fit2cloudzhao

### ⚙️ Enhancements / 功能优化

- **Version list lazy loading**: version history in skill detail modal adds 200ms delay to prevent UI flash; same-skill data cached across modal opens / 版本历史加载增加延迟态，避免闪烁；同技能缓存不重复请求 by @fit2cloudzhao
- **SkillctlGuide admin gating**: CLI guide in profile center now hidden for admin users / 个人中心 SkillctlGuide 仅对普通用户展示 by @fit2cloudzhao
- **Month filter custom scroll panel**: month dropdown in statistics replaced with scrollable custom panel / 月份下拉改为自定义滚动面板，限高可滚动 by @fit2cloudzhao
- **Navigation bar unified**: nav bar items reordered and unified across pages / 导航栏统一，数据统计放在首位 by @fit2cloudzhao
- **User filter via userId**: user filter now passes userId to 1Panel usage-statistics API / 用户筛选通过 userId 透传给 1Panel 接口 by @fit2cloudzhao
- **Release automation**: CI workflow auto-creates GitHub release from tag annotation / CI workflow_dispatch 构建成功后自动创建 GitHub Release by @fit2cloudzhao

### 🛠️ Bug Fixes / 问题修复

- **syncModelsFromPanel modelMap parsing**: defensive parsing with two-pass cleaning for lone surrogate handling in 1Panel modelMap / 解析 1Panel modelMap 增加两轮清洗容错，处理 lone surrogate 异常字符 by @fit2cloudzhao
- **Download auth improvements**: unauthenticated download now shows login dialog instead of silent failure; download uses fetch+Blob with Authorization header; token expiry check / 未登录下载弹框提示登录；下载改用 fetch+Blob 带鉴权头；登录过期检测 by @fit2cloudzhao
- **syncSkills slug conflict**: fix UPSERT by slug UNIQUE constraint using CTE / 修复 syncSkills slug 冲突导致的同步中断 by @fit2cloudzhao
- **Download stats missing**: fix missing download count for versioned downloads / 修复历史版本下载缺少下载量统计 by @fit2cloudzhao
- **ECharts re-init on tab switch**: fix charts not re-initializing when switching tabs in ProfileView / 修复个人中心切 tab 后 ECharts 未重新初始化 by @fit2cloudzhao
- **Month filter startsWith**: fix month filtering to use startsWith for YYYY-MM format compatibility / 月份过滤改为 startsWith 兼容 YYYY-MM 格式 by @fit2cloudzhao
- **Docs image path BASE_PATH**: fix online docs images not loading under sub-path deployment / 修复在线文档图片在 BASE_PATH 子路径下无法加载 by @fit2cloudzhao
- **Docker Compose SELinux**: add :z label to volumes for CentOS deployment compatibility / Docker Compose volume 加 SELinux :z 标签兼容 CentOS by @fit2cloudzhao
- **Empty data states**: fix null/empty data handling in ProfileView for new users / 修复新用户无数据时展示异常 by @fit2cloudzhao
