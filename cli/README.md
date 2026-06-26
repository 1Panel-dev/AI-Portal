# f2chub CLI

F2CHub SkillHub CLI - 一键安装和管理 AI Skill

## 功能特性

- 多平台自动探测（OpenClaw、WorkBuddy）
- 用户自定义安装路径
- `f2c` 短命令别名
- 自动依赖安装（Node.js / Python）

## 安装

```bash
npm install -g @fitskill/f2chub-cli
```

## 命令

### 安装 Skill

```bash
# 自动探测平台安装
f2chub install <skill-name>

# 指定平台安装
f2chub install -p openclaw <skill-name>
f2chub install -p workbuddy <skill-name>

# 强制重新安装
f2chub install -f <skill-name>
```

### 使用 f2c 别名

```bash
f2c skill install <skill-name>
f2c skill install -p openclaw <skill-name>
f2c skill list
f2c skill info <skill-name>
```

### 管理 Skill

```bash
f2chub list                  # 列出已安装
f2chub info <skill-name>     # 查看详情
f2chub update <skill-name>   # 更新
f2chub uninstall <skill-name> # 卸载
f2chub search [query]        # 搜索
```

### 配置管理

```bash
# 查看当前配置
f2chub config list

# 设置平台安装路径
f2chub config set openclaw.path ~/my-custom/skills

# 重置为默认路径
f2chub config reset openclaw
```

## 平台支持

| 平台 | Mac 路径 | Windows 路径 |
|------|---------|-------------|
| OpenClaw | `~/.openclaw/skills` | `~/.openclaw/skills` |
| WorkBuddy | `~/.workbuddy/skills` | `~/.workbuddy/skills` |
| 兜底 | `~/.f2chub/skills` | `~/.f2chub/skills` |

## 路径解析优先级

1. 用户配置 (`~/.f2chub/config.yaml`)
2. 内置默认配置（随 npm 包分发）

## 配置示例

```bash
# 自定义 OpenClaw 安装路径
f2chub config set openclaw.path ~/workspace/skills

# 查看配置
f2chub config list

# 恢复默认
f2chub config reset openclaw
```

## 开发

```bash
# 安装依赖
npm install

# 本地测试
node bin/f2chub.js --help
node bin/f2chub.js install --help

# npm link 本地调试
npm link
f2chub --help
f2c skill --help
```

## License

MIT
