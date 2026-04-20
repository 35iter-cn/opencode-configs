---
description: Task-Notification Protocol Specification for OpenCode Agents
---

# Task-Notification 协议规范

## 1. 来源声明

`<task-notification>` 消息**仅来自** `delegate()` 子代理的异步完成通知，**不是用户输入**。

当父 Agent 通过 `delegate()` 委派任务给子代理后：

- 子代理在独立 session 中异步执行
- 完成后通过 `session.prompt()` 向父 session 发送 `<task-notification>`
- 父 Agent 应将其识别为**子代理输出**，而非新的用户请求

## 2. XML 格式规范

### 2.1 单委托完成通知

每个子代理完成时发送：

```xml
<task-notification>
<task-id>{readable-id}</task-id>
<status>{complete|error|cancelled|timeout}</status>
<summary>Background agent {status}: {title}</summary>
<title>{auto-generated-title}</title>
<description>{auto-generated-description}</description>
<error>{error-message-if-any}</error>
<artifact>{persisted-file-path}</artifact>
<retrieval>Use delegation_read("{id}") for full output.</retrieval>
<remaining>{pending-delegation-count}</remaining>
</task-notification>
```

**⚠️ XML 安全提示：** `<title>`、`<description>`、`<error>` 字段直接拼接子代理生成的内容，未做 XML 实体转义。解析器应使用容错解析或 CDATA 包装。

### 2.2 聚合完成通知 (all-complete)

当同一批次所有委托都完成且经过静默期后调度发送。

**实际流程：**

1. 当某周期内所有 terminal 通知完成后，`scheduleAllCompleteForParent()` 启动定时器
2. 等待 `allCompleteQuietPeriodMs`（默认 50ms）静默期
3. 如果在静默期内有新的 `delegate()` 调用，`resetParentAllCompleteNotificationCycle()` 会递增 cycle 并取消旧定时器
4. 静默期结束后，`dispatchScheduledAllComplete()` 发送 all-complete 通知

```xml
<task-notification>
<type>all-complete</type>
<status>completed</status>
<summary>All delegations complete.</summary>
<parent-session-id>{parent-session-id}</parent-session-id>
<cycle>{cycle-number}</cycle>
<cycle-token>{parent-session-id}:{cycle}</cycle-token>
</task-notification>
```

## 3. noReply 行为差异

| 通知类型     | noReply 值 | 行为                                  |
| ------------ | ---------- | ------------------------------------- |
| 单委托完成   | `true`     | 单向通知，**不触发**父 Agent LLM 推理 |
| all-complete | `false`    | 触发父 Agent LLM 推理，允许响应       |

**注意：** `noReply` 是 SDK 参数，实际效果取决于 OpenCode 服务端实现。

## 4. cycle-token 验证规则

`cycle-token` 格式：`{parentSessionID}:{cycleNumber}`

**作用：** 边界水印，防止过期通知干扰。

**规则：**

1. 每次调用 `delegate()` 注册新批次时，cycle 计数器 +1
2. 父 Agent 收到 `all-complete` 时，检查 `cycle-token` 是否匹配当前最新 cycle
3. 如果 `cycle-token` 与当前最新 `allCompleteCycleToken` 不匹配（字符串严格相等判断 `!==`），**忽略该通知**

**示例：**

```
Cycle 1: [D1, D2] → all-complete (token: session-abc:1)
Cycle 2: [D3]    → all-complete (token: session-abc:2)

如果 Cycle 1 的 all-complete 延迟到达，token session-abc:1 < 当前 cycle 2，应忽略。
```

## 5. Plan-Mode 处理流程

当 Plan Agent 收到 `<task-notification>` 时：

### 5.1 单委托通知处理

- **识别：** 检查 `<task-id>` 和 `<status>` 字段
- **行为：**
  - 如果 `status` 为 `complete` 且包含研究结果，记录为可用资源
  - 如果 `status` 为 `error`，评估是否需要重试或调整计划
  - **不要**将其视为用户的新指令或问题
- **读取：** 如需完整内容，调用 `delegation_read("{task-id}")`

### 5.2 all-complete 通知处理

- **识别：** 检查 `<type>all-complete</type>`
- **验证：** 确认 `cycle-token` 匹配当前最新注册批次
- **行为：**
  - 汇总所有已完成委托的结果
  - 根据研究结果继续推进当前计划阶段
  - 可以触发计划更新或阶段转换

### 5.3 禁止行为

- ❌ 不要将 `<task-notification>` 视为用户输入进行回复
- ❌ 不要询问用户"有什么可以帮您？"
- ❌ 忽略过期的 `all-complete` 通知

## 6. 与 Delegation 工具的关系

| 工具                      | 作用             | 使用时机                 |
| ------------------------- | ---------------- | ------------------------ |
| `delegate(prompt, agent)` | 启动异步子代理   | 需要并行研究或后台任务时 |
| `delegation_read(id)`     | 读取完整结果     | 收到单委托通知后         |
| `delegation_list()`       | 查看所有委托状态 | 需要概览时               |

**协作流程：**

1. Plan Agent 调用 `delegate()` 启动研究
2. 子代理异步执行，完成后发送 `<task-notification>`
3. Plan Agent 识别通知，调用 `delegation_read()` 获取完整结果
4. 将研究结果纳入计划决策

## 7. 调度与去重机制

### 7.1 单委托通知去重

每个委托的 terminal 通知**仅发送一次**：

- `notifyParent()` 检查 `terminalNotifiedAt` 字段（`background-agents.ts:1095-1100`）
- 如果已设置，跳过发送（幂等保护）
- 发送后更新 `terminalNotifiedAt` 和 `terminalNotificationCount`

### 7.2 all-complete 去重

每个周期的 all-complete 通知**仅发送一次**：

- `allCompleteNotifiedCycleToken` 记录已发送的周期令牌（`background-agents.ts:821`）
- 如果当前 cycle-token 已发送过，跳过
- 发送后更新 `allCompleteNotifiedAt` 和 `allCompleteNotificationCount`

### 7.3 调度取消机制

新批次注册时会重置状态：

- `delegate()` 调用 `resetParentAllCompleteNotificationCycle()`（`background-agents.ts:585, 732-745`）
- 递增 `allCompleteCycle`
- 生成新的 `allCompleteCycleToken`
- 取消任何待发送的 all-complete 定时器
- 重置 `allCompleteNotifiedAt`

**竞态条件处理：** 如果在 all-complete 等待静默期期间有新委托注册，旧批次的 all-complete 通知会被取消，新批次将独立计算完成状态。
