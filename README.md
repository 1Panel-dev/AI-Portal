## 1Panel AI 门户

面向企业内部用户提供自助入口，让团队成员自助申请API Key、查看用量、安装 Skills 等。

注：AI 门户是 1Panel 企业版的专属功能。

<img alt="1Panel AI 门户" src="https://github.com/user-attachments/assets/e9320bbb-b847-446e-8aec-501de6eafaea" />

## 主要功能

- **API Key 管理** — 面向普通用户提供 API Key 申请、查看、重置和删除能力
- **模型广场** — 集中展示 1Panel AI 网关中的可用模型，帮助用户快速了解模型资源
- **技能市场** — 展示 1Panel 已上架的技能，支持按分类浏览、搜索和安装
- **MCP 市场** — 面向 1Panel MCP 场景，展示和管理可用的 MCP 服务
- **技能提交与审核** — 支持用户上传技能包，管理员审核、发布和维护上架内容
- **管理后台** — 提供技能管理、用户管理、OAuth 登录配置和 1Panel 网关配置，满足企业版统一运营管理需求

## 快速开始

```bash
git clone https://github.com/1Panel-dev/AI-Portal.git
cp .env.example .env
# 编辑 .env 配置 PANEL_BASE_URL 和 PANEL_API_KEY（连接 1Panel 企业版网关）
# 全部可配置参数见 开发文档
docker-compose up -d
```

访问 `http://localhost:3000`

## 反向代理注意事项

通过 nginx 等反向代理对外提供 HTTPS 服务（尤其是带非标准端口，如 `:8443`）时，**必须把原始 Host 头（含端口）透传给后端**：

```nginx
proxy_set_header Host $http_host;   # $host 不含端口, 会导致 OAuth 回调地址丢失端口号
proxy_set_header X-Forwarded-Proto $scheme;
```

否则第三方登录（企业微信等 OAuth）的回调地址会被拼成 `https://domain/...`（丢端口），企微侧校验失败无法完成登录。回调地址由后端根据请求 Host 自动推导，管理员在「第三方登录」页面可见当前生效的回调地址。

## 文档

开发、配置、项目结构和默认账号说明见 [开发文档](docs/development.md)。

## Security

Found a vulnerability? Please read [SECURITY.md](SECURITY.md) before disclosing.

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
