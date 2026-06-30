# 1Panel AI 门户

面向 1Panel 企业版，统一提供模型广场、API Key 管理和 AI 技能市场能力。

## 主要功能

- **模型广场** — 展示 1Panel AI 网关模型，按供应商分组，支持一键复制模型名
- **API Key 管理** — 支持申请、查看、重置和删除 API Key，并与 1Panel 网关实时同步
- **技能市场** — 支持浏览、搜索和安装 AI 技能（Skill），配套 CLI 工具 `skillctl`
- **技能提交与审核** — 支持用户上传技能包，管理员审核上线
- **管理后台** — 支持技能审核、用户管理、OAuth 配置和 1Panel 网关配置
- **OAuth 登录** — 支持企业微信等第三方登录，并提供可插拔适配器
- **远端同步** — 支持从 1Panel 定时同步模型列表和技能

## 快速开始

```bash
git clone https://github.com/1Panel-dev/AI-Portal.git
cp .env.example .env
# 编辑 .env 配置 PANEL_BASE_URL 和 PANEL_API_KEY（连接 1Panel 企业版网关）
docker-compose up -d
```

访问 `http://localhost:3000`

## 文档

开发、配置、项目结构和默认账号说明见 [开发文档](docs/development.md)。

## Security

Found a vulnerability? Please read [SECURITY.md](SECURITY.md) before disclosing.

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
