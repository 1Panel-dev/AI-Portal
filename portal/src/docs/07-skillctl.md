---
id: skillctl
label: skillctl 命令行说明
order: 8
description: 使用 skillctl 登录 1Panel Skills Hub、搜索并安装 Skill。
---

# skillctl 用户使用说明

`skillctl` 是 1Panel Enterprise Skills Hub 的命令行客户端，用于登录 1Panel 端点、搜索 Skill，并将 Skill 安装到本地 Agent 的 `skills` 目录。

## 适用场景

- 从 1Panel Skills Hub 搜索可用 Skill。
- 将 Skill 一键安装到本地 Agent 的 Skill 目录。
- 管理多个 1Panel 端点和多个本地 Agent 安装目标。
- 指定 Skill 版本安装或覆盖已有 Skill。

## 构建 skillctl

进入 `skillctl` 目录：

```bash
cd skillctl
```

构建当前平台二进制：

```bash
make build
```

构建产物默认输出到：

```text
skillctl/dist/skillctl
```

也可以构建指定平台：

```bash
make linux-amd64
make linux-arm64
make darwin-amd64
make darwin-arm64
```

## 安装到系统命令

将二进制文件安装为系统命令：

```bash
chmod +x ./skillctl
sudo cp ./skillctl /usr/local/bin/skillctl
```

安装后可以检查命令是否可用：

```bash
skillctl help
```

## 首次使用流程

首次使用通常按下面顺序执行：

```bash
skillctl login https://panel.example.com --token <token>
skillctl agent create default --skills-path /path/to/skills
skillctl search
skillctl install <skill-name>
```

其中：

- `https://panel.example.com` 替换为实际 1Panel 地址。
- `<token>` 替换为 1Panel API Key。
- `/path/to/skills` 替换为本地 Agent 的 Skill 目录。
- `<skill-name>` 替换为 `skillctl search` 查询到的 Skill 名称。

## 登录与退出

使用 1Panel 地址和 API Key 登录：

```bash
skillctl login https://panel.example.com --token <token>
```

`--token` 也可以写成 `-t`：

```bash
skillctl login https://panel.example.com -t <token>
```

默认情况下，凭据会保存到本地配置文件中。token 不会明文保存，而是经过 base64 编码后写入配置文件。

如果本机已经安装并初始化了 `pass`，也可以把 token 保存到 `pass`：

```bash
skillctl login https://panel.example.com --token <token> --auth-store pass
```

查看当前登录身份：

```bash
skillctl whoami
```

指定端点查看身份：

```bash
skillctl whoami --endpoint https://panel.example.com
```

退出当前端点：

```bash
skillctl logout
```

退出指定端点：

```bash
skillctl logout https://panel.example.com
```

## 配置 Agent 安装目标

Agent 安装目标用于记录 Skill 应该安装到哪个本地目录。

创建 Agent：

```bash
skillctl agent create default --skills-path /path/to/skills
```

第一次创建 Agent 时，它会自动成为当前 Agent。

查看 Agent 列表：

```bash
skillctl agent list
```

当前 Agent 会用 `*` 标记。

切换当前 Agent：

```bash
skillctl agent use default
```

查看当前 Agent：

```bash
skillctl agent current
```

## 查看和切换配置

查看完整配置：

```bash
skillctl config view
```

输出中的 token 会脱敏显示为 `******`。

查看当前端点和当前 Agent：

```bash
skillctl config current
```

切换当前 1Panel 端点：

```bash
skillctl config use https://panel.example.com
```

默认配置文件位置：

```text
~/.config/skillctl/config.json
```

Windows 下默认配置文件位于：

```text
%APPDATA%\skillctl\config.json
```

如果设置了 `XDG_CONFIG_HOME`，配置文件位于：

```text
$XDG_CONFIG_HOME/skillctl/config.json
```

也可以通过 `SKILLCTL_CONFIG` 指定配置文件路径：

```bash
SKILLCTL_CONFIG=/path/to/config.json skillctl config current
```

## 搜索 Skill

搜索所有 Skill：

```bash
skillctl search
```

按关键词搜索：

```bash
skillctl search nginx
```

默认情况下，搜索结果只显示每个 Skill 的最新发布版本。查看全部版本：

```bash
skillctl search nginx --all-versions
```

限制返回数量：

```bash
skillctl search nginx --limit 20
```

`--limit` 也可以写成 `-n`：

```bash
skillctl search nginx -n 20
```

不截断描述：

```bash
skillctl search nginx --no-trunc
```

按 Agent 类型过滤：

```bash
skillctl search --filter agent=<agent-type>
```

按风险等级过滤：

```bash
skillctl search --filter risk=low
```

按版本过滤：

```bash
skillctl search --filter version=1.0.0
```

`--filter` 也可以写成 `-f`：

```bash
skillctl search -f agent=<agent-type>
```

搜索结果包含以下字段：

| 字段 | 说明 |
|------|------|
| `NAME` | Skill 名称 |
| `VERSION` | Skill 版本 |
| `DESCRIPTION` | Skill 描述 |
| `RISK` | 风险等级 |
| `AGENT` | 适用 Agent 类型 |
| `UPDATED` | 更新时间 |

## 安装 Skill

安装到当前 Agent：

```bash
skillctl install <skill-name>
```

安装指定版本：

```bash
skillctl install <skill-name>@<version>
```

安装到指定 Agent：

```bash
skillctl install <skill-name> --agent default
```

不使用 Agent，直接安装到指定目录：

```bash
skillctl install <skill-name> --path /path/to/skills
```

`--path` 也可以写成 `--dir`：

```bash
skillctl install <skill-name> --dir /path/to/skills
```

指定 1Panel 端点安装：

```bash
skillctl install <skill-name> --endpoint https://panel.example.com
```

如果目标目录中已经存在同名 Skill，默认会拒绝覆盖。确认需要覆盖时使用 `--force`：

```bash
skillctl install <skill-name> --force
```

`--force` 也可以写成 `-f`：

```bash
skillctl install <skill-name> -f
```

安装成功后会输出：

- Skill 名称
- Skill 版本
- 使用的 Agent
- 安装路径
- 使用的 1Panel 端点

## 安装行为说明

安装时，`skillctl` 会从 Skills Hub 下载 Skill zip 包，并解压到目标 `skills` 目录下的同名子目录。

例如：

```bash
skillctl agent create default --skills-path /opt/agent/skills
skillctl install demo
```

安装后的目录通常为：

```text
/opt/agent/skills/demo
```

如果下载结果中包含 SHA256，`skillctl` 会校验安装包完整性。校验失败时会拒绝安装。

覆盖安装时，`skillctl` 会先临时备份旧目录；如果复制新文件失败，会尽量恢复旧目录。

## 常见示例

搜索并安装最新版本：

```bash
skillctl search redis
skillctl install redis-helper
```

查看所有版本并安装指定版本：

```bash
skillctl search redis-helper --all-versions
skillctl install redis-helper@1.2.0
```

安装到指定 Agent：

```bash
skillctl agent create prod --skills-path /opt/prod-agent/skills
skillctl install redis-helper --agent prod
```

直接安装到指定目录：

```bash
skillctl install redis-helper --path /opt/agent/skills
```

切换端点后搜索：

```bash
skillctl config use https://panel.example.com
skillctl search
```

## 限制和安全校验

- 1Panel 端点必须以 `http://` 或 `https://` 开头。
- `--path` 和 `--agent` 不能同时使用。
- Agent 名称不能是 `.`、`..`，也不能包含路径分隔符。
- Skill 名称和版本不能包含路径分隔符。
- Skill 安装目录不能是文件系统根目录。
- 单个 Skill 安装包最大下载限制为 100 MB。
- Skill 安装包必须是 zip 格式。
- Skill 安装包不能包含软链接。
- Skill 安装包不能包含越权路径，例如 `../`。
- Skill 安装包只能包含普通文件和目录。

## 常见错误处理

### 未配置端点

如果提示没有配置 1Panel 端点，先执行：

```bash
skillctl login https://panel.example.com --token <token>
```

### 未配置 Agent

如果提示没有目标 Agent，先创建 Agent：

```bash
skillctl agent create default --skills-path /path/to/skills
```

也可以不创建 Agent，直接安装到路径：

```bash
skillctl install <skill-name> --path /path/to/skills
```

### 认证失败

认证失败常见原因：

- token 无效或已过期。
- 当前客户端 IP 不在 1Panel API 白名单中。
- 本机和服务器时间差过大。

可以重新登录：

```bash
skillctl login https://panel.example.com --token <token>
```

### Skill 已存在

如果目标目录已有同名 Skill，会提示拒绝覆盖。确认覆盖时执行：

```bash
skillctl install <skill-name> --force
```

### 找不到 Skill

先搜索确认 Skill 名称：

```bash
skillctl search <keyword>
```

如果要查看所有版本：

```bash
skillctl search <keyword> --all-versions
```

### pass 不可用

如果使用 `--auth-store pass` 时提示 `pass` 不可用，需要先安装并初始化 `pass`：

```bash
pass init <gpg-key-id>
```

或者改用默认文件存储：

```bash
skillctl login https://panel.example.com --token <token> --auth-store file
```

## 命令总览

```text
skillctl is the command line client for 1Panel Enterprise Skills Hub.

Usage:
  skillctl <command> [options]

Commands:
  login    Login to a 1Panel endpoint
  logout   Logout from the current or specified endpoint
  whoami   Show current login identity
  config   View or switch endpoint configuration
  agent    Manage local agent install targets
  search   Search skills in Skills Hub
  install  Install a skill to an agent or path

Command usage:
  skillctl login <endpoint> --token <token> [--auth-store file|pass]
  skillctl logout [endpoint]
  skillctl whoami [--endpoint <endpoint>]
  skillctl config view
  skillctl config current
  skillctl config use <endpoint>
  skillctl agent create <agent-name> --skills-path <skills-path>
  skillctl agent list
  skillctl agent use <agent-name>
  skillctl agent current
  skillctl search [keyword] [--endpoint <endpoint>] [--limit <n>] [--filter <key=value>] [--all-versions] [--no-trunc]
  skillctl install <skill-name> [--agent <agent-name>] [--path <skills-path>] [--endpoint <endpoint>] [--force]

Search filters:
  agent=<agent-type>  Filter by applicable agent type
  risk=<level>        Filter by risk level
  version=<version>   Filter by skill version

Search defaults to the latest published version of each skill. Use --all-versions to show every published version.

Environment:
  SKILLCTL_CONFIG  Override the config file path
```
