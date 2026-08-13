---
id: submit
label: 提交技能
order: 5
group: 使用指南
description: 向平台贡献你的 AI 技能，分享给更多用户。
---

# 提交技能

> ⚠️ **注意**：提交技能需要 `skill:create` 权限。若个人中心看不到「提交技能」按钮，说明你的角色没有该权限，请联系管理员。

## 1. 上传技能包

在「提交技能」弹框里只需上传 `.zip` 技能包：

- **技能包**（必填）— `.zip` 格式，拖拽或点击选择上传，需包含 `skill.md`
- 技能名称、版本、描述、分类等信息会**自动从包内 `skill.md` 读取**，无需手动填写

`skill.md` 使用 YAML frontmatter 声明元数据，例如：

```markdown
---
name: my-awesome-skill
version: 1.2.6
description: 这个技能的功能和使用场景
---
```

提交上架后用户即可通过 `skillctl` 一键安装：

```bash
skillctl install <skill-id>
```

> 💡 **提示**：要发布新版本，请先修改包内 `skill.md` 里的 `version` 字段再上传。

## 2. 等待审核

提交后技能包进入待审核状态，由管理员审核。通过后自动上架到 Skill 广场。

## 3. 查看状态

在「我的技能」页面查看审核进度（待审核 / 已通过 / 已拒绝）。

> 💡 **提示**：技能上架后，用户既能在 Skill 广场看到，也能用 `skillctl` 命令行直接安装。skillctl 的完整用法见左侧导航「skillctl 命令行说明」章节。
