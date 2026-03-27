import test from 'node:test';
import assert from 'node:assert/strict';

import { WindowsNotifyPlugin } from './windows-notify.js';

const decodePowerShellScript = (shellCall) => {
  const encoded = shellCall.values.at(-1);
  return Buffer.from(encoded, 'base64').toString('utf16le');
};

test('notifies when root session becomes busy then idle', async () => {
  const shellCalls = [];
  const rootSession = {
    id: 'root-session-12345678',
    title: 'Root Session',
    slug: 'root-session',
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
      type: 'session.status',
      properties: {
        sessionID: rootSession.id,
        status: { type: 'busy' },
      },
    },
  });

  await plugin.event({
    event: {
      type: 'session.idle',
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  assert.equal(shellCalls.length, 1);
});

test('includes change summary and latest assistant text in notification body', async () => {
  const shellCalls = [];
  const rootSession = {
    id: 'root-session-12345678',
    title: 'Enhanced Session',
    slug: 'enhanced-session',
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
              info: { role: 'assistant' },
              parts: [
                {
                  type: 'text',
                  text: '已完成支付页面重构，并补齐了边界状态处理。',
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
      type: 'session.status',
      properties: {
        sessionID: rootSession.id,
        status: { type: 'busy' },
      },
    },
  });

  await plugin.event({
    event: {
      type: 'session.idle',
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

test('truncates long assistant summary in notification body', async () => {
  const shellCalls = [];
  const rootSession = {
    id: 'root-session-12345678',
    title: 'Long Session',
    slug: 'long-session',
    parentID: null,
    summary: {
      additions: 1,
      deletions: 0,
      files: 1,
    },
  };
  const longText = '这是一段很长的总结。'.repeat(30);

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
              info: { role: 'assistant' },
              parts: [{ type: 'text', text: longText }],
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
      type: 'session.status',
      properties: {
        sessionID: rootSession.id,
        status: { type: 'busy' },
      },
    },
  });

  await plugin.event({
    event: {
      type: 'session.idle',
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

test('prefers final assistant text and excludes reasoning from notification body', async () => {
  const shellCalls = [];
  const rootSession = {
    id: 'root-session-12345678',
    title: 'Reasoning Session',
    slug: 'reasoning-session',
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
              info: { role: 'assistant' },
              parts: [
                {
                  type: 'text',
                  text: '最终结果：支付更新通知已经优化完成。',
                },
                {
                  type: 'reasoning',
                  text: '内部推理：先比较两个方案，再决定收敛文案。',
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
      type: 'session.status',
      properties: {
        sessionID: rootSession.id,
        status: { type: 'busy' },
      },
    },
  });

  await plugin.event({
    event: {
      type: 'session.idle',
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /最终结果：支付更新通知已经优化完成。/);
  assert.doesNotMatch(script, /内部推理：先比较两个方案，再决定收敛文案。/);
});

test('includes official OpenCode app logo in notification script', async () => {
  const shellCalls = [];
  const rootSession = {
    id: 'root-session-12345678',
    title: 'Robot Session',
    slug: 'robot-session',
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
      type: 'session.status',
      properties: {
        sessionID: rootSession.id,
        status: { type: 'busy' },
      },
    },
  });

  await plugin.event({
    event: {
      type: 'session.idle',
      properties: {
        sessionID: rootSession.id,
      },
    },
  });

  const script = decodePowerShellScript(shellCalls[0]);
  assert.match(script, /-AppLogo/);
  assert.match(
    script,
    /https:\/\/opencode\.ai\/apple-touch-icon-v3\.png/,
  );
});
