# 已删除的 Superpowers Skills 清单

这些 skills 原本安装在 `/root/.agents/skills/`，现在已通过 superpowers plugin 替代。
如需重新安装，可以使用以下命令：

## Skills 列表

| Skill                          | 来源             | 安装命令                                                                       |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------ |
| brainstorming                  | obra/superpowers | `opencode run "install skill obra/superpowers/brainstorming"`                  |
| systematic-debugging           | obra/superpowers | `opencode run "install skill obra/superpowers/systematic-debugging"`           |
| test-driven-development        | obra/superpowers | `opencode run "install skill obra/superpowers/test-driven-development"`        |
| verification-before-completion | obra/superpowers | `opencode run "install skill obra/superpowers/verification-before-completion"` |
| writing-plans                  | obra/superpowers | `opencode run "install skill obra/superpowers/writing-plans"`                  |
| writing-skills                 | obra/superpowers | `opencode run "install skill obra/superpowers/writing-skills"`                 |

## 或者直接使用 plugin（推荐）

在 `~/.config/opencode/opencode.jsonc` 中添加：

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]
}
```

## 原始安装信息

- 删除时间：2026-03-31
- 原始来源：https://github.com/obra/superpowers.git
- 安装时间：2026-03-26

## 备用恢复方法

如果 plugin 方式不可用，也可以从 GitHub 直接克隆：

```bash
cd /tmp
git clone https://github.com/obra/superpowers.git
cp -r superpowers/skills/* ~/.agents/skills/
```

---

_注：此清单创建于删除前，用于备份和恢复参考_
