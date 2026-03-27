const MAX_RESULT_LENGTH = 160;
const REMOTE_APP_LOGO_URL =
  'https://opencode.ai/apple-touch-icon-v3.png';

const normalizeSummaryText = (value) => value.replace(/\s+/g, ' ').trim();

const truncateText = (value, maxLength = MAX_RESULT_LENGTH) => {
  const normalized = normalizeSummaryText(value);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

export const formatChangeSummary = (session) => {
  if (!session?.summary) return '';

  const { additions = 0, deletions = 0, files = 0 } = session.summary;
  const parts = [];

  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  if (files > 0) parts.push(`${files} file${files === 1 ? '' : 's'}`);

  return parts.join(' · ');
};

export const extractLastResultFromMessages = (messages) => {
  if (!Array.isArray(messages)) return '';

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.info?.role !== 'assistant') continue;

    const parts = Array.isArray(message.parts) ? message.parts : [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];

      if (part?.type === 'text' && part.text) {
        const text = truncateText(part.text);
        if (text) return text;
      }

      if (part?.type === 'tool' && part.state?.status === 'completed' && part.state.title) {
        return truncateText(`工具：${part.state.title}`);
      }

      if (part?.type === 'patch' && Array.isArray(part.files) && part.files.length > 0) {
        const listedFiles = part.files.slice(0, 2).join(', ');
        const remainder =
          part.files.length > 2 ? ` 等${part.files.length}个文件` : '';
        return truncateText(`修改：${listedFiles}${remainder}`);
      }
    }
  }

  return '';
};

export const WindowsNotifyPlugin = async ({ $, client }) => {
  const sessionCache = new Map();
  const rootActivity = new Map();
  const notifyingRoots = new Set();

  const getShortSessionID = (sessionID) => sessionID.slice(0, 8);

  const isBusyStatus = (status) =>
    status === 'busy' || (typeof status === 'object' && status?.type === 'busy');

  const escapePowerShell = (value) => value.replace(/'/g, "''");

  const listSessionMessages = async (sessionID) => {
    if (!client.session?.messages) return [];

    const attempts = [
      () => client.session.messages({ sessionID, limit: 10 }),
      () => client.session.messages({ path: { id: sessionID }, query: { limit: 10 } }),
    ];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        const result = await attempt();
        if (Array.isArray(result?.data)) return result.data;
        if (Array.isArray(result)) return result;
        if (result?.error) {
          lastError = result.error;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      await logWarn('Failed to load session messages for notification', {
        sessionID,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }

    return [];
  };

  const getSessionInfo = async (sessionID) => {
    const cached = sessionCache.get(sessionID);
    if (cached) return cached;

    const result = await client.session.get({ sessionID });
    if (result.error || !result.data) {
      throw new Error(
        result.error
          ? `Failed to load session ${sessionID}`
          : `Session ${sessionID} not found`,
      );
    }

    sessionCache.set(result.data.id, result.data);
    return result.data;
  };

  const getRootSessionInfo = async (sessionID) => {
    const visited = new Set();
    let current = await getSessionInfo(sessionID);

    while (current.parentID) {
      if (visited.has(current.id)) {
        throw new Error(`Detected session parent cycle at ${current.id}`);
      }

      visited.add(current.id);
      current = await getSessionInfo(current.parentID);
    }

    return current;
  };

  const getNotificationText = async (session) => {
    const label = session.title || session.slug || getShortSessionID(session.id);
    const changeSummary = formatChangeSummary(session);
    const messages = await listSessionMessages(session.id);
    const lastResult = extractLastResultFromMessages(messages);

    const bodyParts = [
      changeSummary || `主会话已完成 · session ${getShortSessionID(session.id)}`,
    ];

    if (lastResult) {
      bodyParts.push(lastResult);
    }

    return {
      title: `OpenCode · ${label}`,
      body: bodyParts.join('\n'),
    };
  };

  const sendNotification = async (session) => {
    const { title, body } = await getNotificationText(session);
    const script = [
      'Import-Module BurntToast',
      `$title = '${escapePowerShell(title)}'`,
      `$body = '${escapePowerShell(body)}'`,
      `$appLogo = '${escapePowerShell(REMOTE_APP_LOGO_URL)}'`,
      'New-BurntToastNotification -Text $title, $body -AppLogo $appLogo',
    ].join('\n');

    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    await $`pwsh.exe -NoProfile -EncodedCommand ${encoded}`;
  };

  const logWarn = async (message, extra) => {
    await client.app.log({
      body: {
        service: 'windows-notify-plugin',
        level: 'warn',
        message,
        extra,
      },
    });
  };

  return {
    event: async ({ event }) => {
      if (event.type === 'session.created' || event.type === 'session.updated') {
        const info = event.properties?.info;
        if (info?.id) {
          sessionCache.set(info.id, info);
        }
        return;
      }

      if (event.type === 'session.status') {
        const sessionID = event.properties?.sessionID;
        const status = event.properties?.status;

        if (!sessionID || !isBusyStatus(status)) return;

        try {
          const rootSession = await getRootSessionInfo(sessionID);
          rootActivity.set(rootSession.id, true);
        } catch (error) {
          await logWarn('Failed to resolve root session for status event', {
            sessionID,
            status,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return;
      }

      if (event.type !== 'session.idle') return;

      const sessionID = event.properties?.sessionID;
      if (!sessionID) return;

      let notifiedRootID = null;

      try {
        const rootSession = await getRootSessionInfo(sessionID);
        if (rootSession.id !== sessionID) return;
        if (!rootActivity.get(rootSession.id)) return;
        if (notifyingRoots.has(rootSession.id)) return;

        notifiedRootID = rootSession.id;
        notifyingRoots.add(rootSession.id);

        await sendNotification(rootSession);
        rootActivity.set(rootSession.id, false);
      } catch (error) {
        await logWarn('Failed to process Windows notification event', {
          sessionID,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (notifiedRootID) {
          notifyingRoots.delete(notifiedRootID);
        }
      }
    },
  };
};
