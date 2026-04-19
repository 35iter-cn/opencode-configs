import test from "node:test";
import assert from "node:assert/strict";

import { WindowsNotifyPlugin } from "./windows-notify.js";

const decodePowerShellScript = (shellCall) => {
  const encoded = shellCall.values.at(-1);
  return Buffer.from(encoded, "base64").toString("utf16le");
};

test("notifies when root session becomes busy then idle", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Root Session",
    slug: "root-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async ({ sessionID }) => {
          assert.equal(sessionID, rootSession.id);
          return { error: null, data: rootSession };
        },
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  assert.equal(shellCalls.length, 1);
});

test("includes change summary and latest assistant text in notification body", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Enhanced Session",
    slug: "enhanced-session",
    parentID: null,
    summary: {
      additions: 12,
      deletions: 3,
      files: 2,
    },
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({
          error: null,
          data: [
            {
              info: { role: "assistant" },
              parts: [
                {
                  type: "text",
                  text: "已完成支付页面重构，并补齐了边界状态处理。",
                },
              ],
            },
          ],
        }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  assert.equal(shellCalls.length, 1);
  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /\+12 · -3 · 2 files/);
  assert.match(script, /已完成支付页面重构，并补齐了边界状态处理。/);
});

test("truncates long assistant summary in notification body", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Long Session",
    slug: "long-session",
    parentID: null,
    summary: {
      additions: 1,
      deletions: 0,
      files: 1,
    },
  };
  const longText = "这是一段很长的总结。".repeat(30);

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({
          error: null,
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: longText }],
            },
          ],
        }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /\+1 · 1 file/);
  assert.match(script, /\.\.\./);
  assert.ok(!script.includes(longText));
});

test("prefers final assistant text and excludes reasoning from notification body", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Reasoning Session",
    slug: "reasoning-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({
          error: null,
          data: [
            {
              info: { role: "assistant" },
              parts: [
                {
                  type: "text",
                  text: "最终结果：支付更新通知已经优化完成。",
                },
                {
                  type: "reasoning",
                  text: "内部推理：先比较两个方案，再决定收敛文案。",
                },
              ],
            },
          ],
        }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /最终结果：支付更新通知已经优化完成。/);
  assert.doesNotMatch(script, /内部推理：先比较两个方案，再决定收敛文案。/);
});

test("includes official OpenCode app logo in notification script", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Robot Session",
    slug: "robot-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /-AppLogo/);
  assert.match(script, /https:\/\/opencode\.ai\/apple-touch-icon-v3\.png/);
});

test("shows error notification instead of completion message after session error", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Errored Session",
    slug: "errored-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.error",
      properties: {
        sessionID: rootSession.id,
        error: {
          name: "ApiError",
          data: {
            message: "模型请求失败：429 rate limit",
          },
        },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "idle" },
      },
    },
  });

  assert.equal(shellCalls.length, 1);
  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /出错啦/);
  assert.match(script, /模型请求失败：429 rate limit/);
  assert.doesNotMatch(script, /主会话已完成/);
});

test("does not duplicate notifications when status idle and session idle both arrive", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Deduped Session",
    slug: "deduped-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "busy" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: rootSession.id,
        status: { type: "idle" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  assert.equal(shellCalls.length, 1);
});

test("notifies immediately when task session errors", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Root Session",
    slug: "root-session",
    parentID: null,
  };
  const taskSession = {
    id: "task-session-87654321",
    title: "Background Task",
    slug: "background-task",
    parentID: rootSession.id,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async ({ sessionID }) => {
          if (sessionID === taskSession.id)
            return { error: null, data: taskSession };
          if (sessionID === rootSession.id)
            return { error: null, data: rootSession };
          return { error: "not found", data: null };
        },
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.error",
      properties: {
        sessionID: taskSession.id,
        error: {
          name: "ApiError",
          data: {
            message: "后台 task 执行失败：tool crashed",
          },
        },
      },
    },
  });

  assert.equal(shellCalls.length, 1);
  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /OpenCode · Background Task/);
  assert.match(script, /出错啦：后台 task 执行失败：tool crashed/);
});

test("does not duplicate task error notifications after idle events", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Root Session",
    slug: "root-session",
    parentID: null,
  };
  const taskSession = {
    id: "task-session-87654321",
    title: "Background Task",
    slug: "background-task",
    parentID: rootSession.id,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async ({ sessionID }) => {
          if (sessionID === taskSession.id)
            return { error: null, data: taskSession };
          if (sessionID === rootSession.id)
            return { error: null, data: rootSession };
          return { error: "not found", data: null };
        },
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.error",
      properties: {
        sessionID: taskSession.id,
        error: {
          name: "ApiError",
          data: {
            message: "后台 task 执行失败：tool crashed",
          },
        },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: taskSession.id,
        status: { type: "idle" },
      },
    },
  });

  await plugin.event({
    event: {
      type: "session.idle",
      properties: {
        sessionID: taskSession.id,
      },
    },
  });

  assert.equal(shellCalls.length, 1);
});

test("notifies when question tool waits for user input", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Question Session",
    slug: "question-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin["tool.execute.before"](
    {
      tool: "question",
      sessionID: rootSession.id,
      callID: "call-question-1",
    },
    {
      args: {
        questions: [
          {
            question: "你要继续执行数据库迁移吗？",
          },
        ],
      },
    },
  );

  assert.equal(shellCalls.length, 1);
  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /OpenCode · Question Session/);
  assert.match(script, /Agent 正在等你回答：你要继续执行数据库迁移吗？/);
});

test("deduplicates repeated question notifications for the same call", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Question Session",
    slug: "question-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin["tool.execute.before"](
    {
      tool: "question",
      sessionID: rootSession.id,
      callID: "call-question-1",
    },
    {
      args: {
        questions: [{ question: "你要继续执行数据库迁移吗？" }],
      },
    },
  );

  await plugin["tool.execute.before"](
    {
      tool: "question",
      sessionID: rootSession.id,
      callID: "call-question-1",
    },
    {
      args: {
        questions: [{ question: "你要继续执行数据库迁移吗？" }],
      },
    },
  );

  assert.equal(shellCalls.length, 1);
});

test("notifies when permission is requested and avoids duplicate replies", async () => {
  const shellCalls = [];
  const rootSession = {
    id: "root-session-12345678",
    title: "Permission Session",
    slug: "permission-session",
    parentID: null,
  };

  const plugin = await WindowsNotifyPlugin({
    $: async (strings, ...values) => {
      shellCalls.push({ strings: [...strings], values });
    },
    client: {
      session: {
        get: async () => ({ error: null, data: rootSession }),
        messages: async () => ({ error: null, data: [] }),
      },
      app: {
        log: async () => {},
      },
    },
  });

  await plugin.event({
    event: {
      type: "permission.updated",
      properties: {
        id: "perm-1",
        sessionID: rootSession.id,
        title: "需要执行 Bash 命令",
      },
    },
  });

  await plugin.event({
    event: {
      type: "permission.updated",
      properties: {
        id: "perm-1",
        sessionID: rootSession.id,
        title: "需要执行 Bash 命令",
      },
    },
  });

  assert.equal(shellCalls.length, 1);
  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /OpenCode · Permission Session/);
  assert.match(script, /Agent 需要你的确认：需要执行 Bash 命令/);
});
