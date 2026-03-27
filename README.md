# opencode-configs

这个仓库是我的本地 OpenCode 配置目录快照，路径对应 `~/.config/opencode/`。

它主要包含三类内容：

- OpenCode 核心配置
- oh-my-opencode（OMO）插件配置
- 少量本地插件与任务记录数据

这不是一个常规 Node.js 应用，也不是业务项目源码仓库。这里没有应用构建流程、没有测试套件、也没有常规的 `src/` 目录。

## 仓库作用

这个仓库用于统一管理我的 OpenCode 运行环境，包括：

- OpenCode 主配置和插件加载
- OMO agents / categories / fallback model 配置
- 自定义本地插件
- TUI 配置
- 本地任务系统数据目录结构

如果你想了解“为什么某个 agent 用了某个模型”、“为什么插件会被自动加载”、“为什么会有本地任务 JSON”，这些都应该先从这个仓库看起。

## 目录结构

```text
.
├── AGENTS.md                  # 本仓库的代理工作说明
├── README.md                  # 本说明文档
├── opencode.json              # OpenCode 核心配置（OpenCode 也支持 opencode.jsonc）
├── oh-my-opencode.jsonc       # OMO 插件层配置
├── tui.json                   # TUI 配置
├── package.json               # 本地依赖（目前非常少）
├── bun.lock                   # bun 锁文件
├── .prettierrc                # JSONC / lockfile 格式化规则
├── plugins/
│   ├── omo-env-remover.js     # 移除系统提示中的 <omo-env> 块
│   └── windows-notify.js      # Windows 桌面通知插件
└── tasks/                     # 本地任务记录（gitignored）
```

说明：`tasks/` 目录虽然在本地存在，但被 `.gitignore` 忽略，不会作为稳定仓库内容进行版本管理。

## 核心文件说明

### `opencode.json`

这是 OpenCode 核心配置文件，对应 OpenCode 官方配置 schema：

- Schema: `https://opencode.ai/config.json`

OpenCode 核心配置除了 `opencode.json` 之外，也支持使用 `opencode.jsonc`。当前仓库保留的是 `opencode.json`。

当前仓库里它主要负责：

- 设置全局权限策略
- 注册插件
- 挂载本地插件文件

当前启用的插件包括：

- `oh-my-opencode@3.14.0`
- `opencode-antigravity-auth@1.6.0`
- `./plugins/omo-env-remover.js`
- `./plugins/windows-notify.js`

### `oh-my-opencode.jsonc`

这是 OMO 的配置文件，负责定义：

- agents 使用的模型
- fallback models
- categories 对应的模型策略
- 并发设置
- 部分实验特性

当前配置里可以看到多个自定义 agent，例如：

- `sisyphus`
- `oracle`
- `explore`
- `librarian`
- `metis`
- `momus`

以及多个 category，例如：

- `visual-engineering`
- `ultrabrain`
- `deep`
- `quick`
- `writing`

该文件使用 JSONC 形式，适合带注释的配置维护。

当前 `experimental` 中已启用：

- `aggressive_truncation`
- `task_system`
- `disable_omo_env`

### `tui.json`

这是 OpenCode TUI 的配置文件。当前内容很少，主要用于声明对应 schema：

- Schema: `https://opencode.ai/tui.json`

### `AGENTS.md`

这是给 agentic coding agents 使用的仓库级说明文件。

当前只有一条最小规则：

- 所有回复必须使用中文

## 本地插件

### `plugins/omo-env-remover.js`

这个插件会在系统提示组装时移除 `<omo-env> ... </omo-env>` 块，避免把不希望暴露给下游模型的环境信息继续传递下去。

目前 OMO 已同时启用官方实验特性 `experimental.disable_omo_env: true`。这意味着 OMO 会在更早阶段尽量不注入 `<omo-env>`；而 `plugins/omo-env-remover.js` 仍然保留，作为最终 `SystemPromptAssemble` 阶段的兜底清理层。也就是说，两者现在是“官方开关优先 + 本地插件兜底”的关系，而不是二选一替换。

### `plugins/windows-notify.js`

这个插件会在主会话完成后，通过 PowerShell + BurntToast 发送 Windows 桌面通知。它会：

- 跟踪 session 信息
- 识别根会话
- 避免重复通知
- 在异常时写 warn 日志

如果你在调试通知逻辑，这个文件是第一入口。

## 安装与使用

这个仓库默认对应用户级 OpenCode 配置目录：

```bash
~/.config/opencode/
```

如果你要在一台新机器上恢复这套配置，最直接的方式是把仓库放到这个目录，然后安装依赖。

### 安装依赖

```bash
bun install
```

当前 `package.json` 只有一个直接依赖：

- `@opencode-ai/plugin`

## 常用验证命令

这个仓库没有 build / lint / test scripts，因此最有价值的验证方式是直接检查 OpenCode 配置是否能被正确解析。

### 验证配置解析

```bash
opencode debug config
opencode models
opencode providers list
```

适用场景：

- 修改 `opencode.json`
- 修改 `oh-my-opencode.jsonc`
- 调整模型、provider 或 fallback 逻辑

### 启动 OpenCode

```bash
opencode
```

如果只是查看版本：

```bash
opencode --version
```

### JavaScript 插件语法检查

```bash
node --check plugins/omo-env-remover.js
node --check plugins/windows-notify.js
```

### 格式化配置与文档

```bash
npx prettier --write README.md AGENTS.md opencode.json oh-my-opencode.jsonc plugins/*.js
```

如果未来把 OpenCode 核心配置切换为 `opencode.jsonc`，这里也应同步替换对应文件名。

## 关于测试

这是一个配置仓库，不是带测试基础设施的应用仓库。

当前仓库现状：

- 没有 `build` script
- 没有 `lint` script
- 没有 `test` script
- 没有 Jest / Vitest / Playwright 配置
- 没有 `*.test.*` / `*.spec.*` 文件

所以这里不存在“运行单个测试”的标准命令。若未来新增测试框架，应同步更新 README 和 `AGENTS.md`。

## 任务系统数据

本地环境里存在 `tasks/` 目录，用于保存任务 JSON 数据。当前可见的子目录包括：

- `tasks/company-portal/`
- `tasks/opencode/`
- `tasks/root/`
- `tasks/skills/`

这些内容被 `.gitignore` 忽略，因此：

- 可以把它视为本地运行时数据
- 不应把它当成业务源码
- 除非明确需要，否则不应批量修改历史任务记录

## 敏感文件说明

以下文件或目录属于本地敏感/运行时数据，已被 `.gitignore` 忽略：

- `antigravity-accounts.json`
- `antigravity-accounts.json.*.tmp`
- `antigravity-signature-cache.json`
- `antigravity-logs/`
- `tasks/`

不要在文档、提交或调试输出中泄露这些文件的敏感内容。

## 参考资料

- OpenCode Config Docs: `https://opencode.ai/docs/config/`
- OpenCode Plugins Docs: `https://opencode.ai/docs/plugins/`
- OpenCode Config Schema: `https://opencode.ai/config.json`
- OMO Documentation: `https://ohmyopencode.com/documentation/`
- OMO Configuration Docs: `https://ohmyopencode.com/configuration/`

## 总结

如果把这个仓库简单理解成一句话：

> 这是一个用于维护 OpenCode + OMO 本地运行环境的配置仓库，而不是应用代码仓库。

修改这里的任何内容时，优先验证配置是否能被 OpenCode 正常加载，而不是寻找不存在的 build/test 流程。
