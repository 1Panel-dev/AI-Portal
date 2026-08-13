# AI-Portal 后台功能与权限对照清单

> 生成时间：2026-08-10
> 依据：`portal/src/views` 各页面真实代码 + `server/routes/*` 后端 `requirePermission` 守卫
> 用途：对照「菜单 → 功能 → 权限」是否与真实实现一致

## 一、后台菜单 ↔ 关联权限总表（当前 RolesView MENU_TO_OPS）

| 菜单 | 关联权限 | 说明 |
|------|---------|------|
| 数据统计 `menu:admin-stats` | `user:view` | 统计页查看 |
| 审核管理 `menu:admin-review` | `skill:review`, `user:view` | 审核技能 + 首页统计 |
| 模型管理 `menu:admin-models` | `model:view`, `system:config` | 模型列表 + 同步按钮 |
| 技能管理 `menu:admin-skills` | `skill:view`, `skill:edit`, `skill:publish`, `skill:delete`, `system:config` | 技能 CRUD + 同步按钮 |
| MCP 管理 `menu:admin-mcps` | `mcp:view`, `system:config` | MCP 列表 + 同步按钮 |
| 资源组管理 `menu:admin-groups` | `group:view`, `group:create`, `group:edit`, `group:delete` | 资源组 CRUD + 配置组内资源 |
| 资源组授权 `menu:admin-assignments` | `group:view`, `group:assign`, `user:view` | 管理授权给谁 |
| 用户管理 `menu:admin-users` | `user:view`, `user:create`, `user:edit`, `user:password`, `user:batch-password`, `user:assign`, `user:delete` | 用户 CRUD + 密码/角色 |
| 角色权限 `menu:admin-roles` | `role:view`, `role:create`, `role:edit`, `role:delete` | 角色 CRUD |
| 基础配置 `menu:admin-config` | `system:config` | 系统配置 |
| 第三方登录 `menu:admin-oauth` | `system:config` | OAuth 配置 |
| AI 网关同步 `menu:admin-panel` | `group:view`, `group:panel-sync` | 面板数据 + 手动同步 |

## 二、用户侧菜单 ↔ 关联权限

| 菜单 | 关联权限 | 说明 |
|------|---------|------|
| 模型广场 `menu:models` | `model:view` | 广场查看 |
| Skill 广场 `menu:skills` | `skill:view` | 广场查看 |
| MCP 广场 `menu:mcp` | `mcp:view` | 广场查看 |
| 在线文档 `menu:docs` | （无） | 公开文档 |
| API Key 管理 `menu:api-keys` | `key:view`, `key:create`, `key:edit`, `key:delete` | API Key CRUD |
| 我的技能 `menu:my-skills` | `skill:create` | 提交/管理自己的技能 |

> 注：`menu:profile`（个人中心）为默认权限，不纳入配置；`menu:submit`（提交技能）不单独展示，归入"我的技能"。

---

## 三、各后台页面真实功能明细

### 1. 数据统计 `/admin/stats`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看统计（总请求/Tokens/活跃用户/失败请求） | `GET /api/admin/usage-statistics` | `user:view` |
| 按用户筛选（用户下拉） | `GET /api/admin/portal-users/map` | `user:view` |
| 用量图表（趋势/红榜/黑榜/分布：Provider/模型/Tokens） | 同 usage-statistics | `user:view` |

纯查看，无增删改。

### 2. 审核管理 `/admin`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看提交列表（待审核/已通过/已拒绝/全部） | `GET /api/admin/submissions/all` | `skill:review` |
| 统计卡片（总技能/上架/待审核/下载量） | `GET /api/admin/stats` | `user:view` |
| 通过技能 | `POST /api/admin/approve/:id` | `skill:review` |
| 拒绝技能（含拒绝原因） | `POST /api/admin/reject/:id` | `skill:review` |

无创建/删除。

### 3. 模型管理 `/admin/models`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看模型列表（模型名/供应商/类型/状态） | `GET /api/models` | `model:view` |
| 同步按钮 | `POST /api/admin/panel-config/sync-now` | `system:config` |

纯查看 + 同步。

### 4. 技能管理 `/admin/skills`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看技能列表（搜索/分类/排序/分页） | `GET /api/admin/skills` | `skill:view` |
| 编辑技能（标题/描述/分类/安装命令/文档/版本） | `PUT /api/admin/skills/:id` | `skill:edit` |
| 上架/下架 | `POST /api/admin/skills/:id/toggle` | `skill:publish` |
| 删除技能 | `DELETE /api/admin/skills/:id` | `skill:delete` |
| 同步按钮 | `POST /api/admin/panel-config/sync-now` | `system:config` |

### 5. MCP 管理 `/admin/mcps`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看 MCP 列表（搜索/分页） | `GET /api/mcp/search` | `mcp:view` |
| 同步按钮 | `POST /api/admin/panel-config/sync-now` | `system:config` |

纯查看 + 同步。

### 6. 资源组管理 `/admin/groups`（+ 编辑页 `/admin/groups/:id`）
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看资源组列表（成员数/资源数） | `GET /api/admin/groups` | `group:view` |
| 新建资源组（名称/描述） | `POST /api/admin/groups` | `group:create` |
| 删除资源组 | `DELETE /api/admin/groups/:id` | `group:delete` |
| 查看资源类型清单 | `GET /api/admin/resource-types` | `group:view` |
| 查看全量资源（模型/Skill/MCP，供勾选） | `GET /api/admin/resources-list` | `group:view` |
| **编辑页：配置组内资源**（勾选模型/Skill/MCP） | `PUT /api/admin/groups/:id/items` | `group:edit` |

### 7. 资源组授权 `/admin/resource-assignments`（+ 编辑页 `/admin/resource-assignments/:id`）
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看资源组列表（已授权用户数） | `GET /api/admin/groups` | `group:view` |
| 预览组内资源（按成员交集） | `GET /api/admin/groups/:id/resources-preview` | `group:view` |
| 查看组详情（成员列表） | `GET /api/admin/groups/:id` | `group:view` |
| **编辑页：管理授权成员**（穿梭框 全用户↔已授权） | `PUT /api/admin/groups/:id/members` | `group:assign` |
| 选用户列表（全量用户） | `GET /api/admin/portal-users` | `user:view` |

### 8. 用户管理 `/admin/users`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看用户列表（搜索/分页/排序） | `GET /api/admin/portal-users` | `user:view` |
| 新增用户（用户名/显示名/初始密码） | `POST /api/admin/portal-users` | `user:create` |
| 分配角色 | `GET/PUT /api/admin/users/:id/roles` | `user:assign` |
| 修改密码 | `POST /api/admin/portal-users/password` | `user:password` |
| 批量改密 | `GET /api/admin/panel-users`、`POST /api/admin/panel-users/batch-password` | `user:batch-password` |
| 删除用户（先清理 1Panel 远端 + API Key） | `DELETE /api/admin/portal-users/:id` | `user:delete` |
| 同步用户（异步任务） | `POST /api/admin/portal-users/sync` | `user:edit` |
| 查看同步任务状态 | `GET /api/admin/sync-tasks/:taskId` | `user:view` |

### 9. 角色权限 `/admin/roles`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看角色列表 | `GET /api/admin/roles` | `role:view` |
| 查看权限位清单 | `GET /api/admin/permissions` | `role:view` |
| 新建角色（名称/继承自/勾选菜单+权限） | `POST /api/admin/roles` | `role:create` |
| 编辑角色权限 | `PUT /api/admin/roles/:id/permissions` | `role:edit` |
| 删除角色 | `DELETE /api/admin/roles/:id` | `role:delete` |

### 10. 基础配置 `/admin/config`
| Tab | 功能 | 接口 | 权限 |
|-----|------|------|------|
| **1Panel 配置** | 网关地址/API Key/超时/同步间隔/定时同步/技能上传开关/允许提交技能开关/新建用户角色 | `GET|POST /api/admin/panel-config` | `system:config` |
| | 测试连接 | `POST /api/admin/panel-config/test` | `system:config` |
| | 立即同步 | `POST /api/admin/panel-config/sync-now` | `system:config` |
| **站点设置** | 调用示例（Base URL + curl 模板） | `GET|POST /api/admin/model-example` | `system:config` |
| | 站点品牌（站点名/Logo/Favicon） | `GET|POST /api/admin/branding` | `system:config` |
| | 公告横幅 + 首次访问弹窗 | `GET|POST /api/admin/announcement` | `system:config` |
| （隐藏存储 tab） | 本地存储目录/COS 配置（不可见） | `POST /api/admin/config`、`/api/admin/config/test-cos` | `system:config` |

### 11. 第三方登录 `/admin/oauth`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看 Provider 列表 | `GET /api/admin/oauth/providers` | `system:config` |
| 启用/禁用 + 配置字段 + 排序 | `PUT /api/admin/oauth/providers/:provider` | `system:config` |
| 测试连接 | `POST /api/admin/oauth/providers/:provider/test` | `system:config` |

### 12. AI 网关同步 `/admin/panel-groups`
| 功能 | 接口 | 权限 |
|------|------|------|
| 查看用户组/模型组 | `GET /api/admin/panel-groups` | `group:view` |
| 手动同步 | `POST /api/admin/panel-groups/sync` | `group:panel-sync` |

---

## 四、关键结论（核对时注意）

1. **同步按钮统一走 `POST /api/admin/panel-config/sync-now`（`system:config`）**
   - 模型管理、MCP 管理、技能管理、基础配置 的"同步"都是这一个接口
   - 所以这三个资源管理页都要带 `system:config` 才能用同步功能
2. **AI 网关同步页的手动同步走 `POST /api/admin/panel-groups/sync`（`group:panel-sync`）**，与上面的 sync-now 不同
3. **资源组管理 = 管组本身 + 配置组内资源（items → group:edit）**
4. **资源组授权 = 管理授权给谁（members → group:assign）**，独立权限
5. **技能管理不需要 `skill:create`**（管理员不新建技能，create 是用户提交技能用）
6. 前端 `can()` 与后端 `requirePermission()` 一一对应（如 `user:create` ↔ `POST /admin/portal-users`）
