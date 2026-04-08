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

const extractErrorMessage = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return truncateText(error);

  const dataMessage = error?.data?.message;
  if (typeof dataMessage === 'string' && dataMessage.trim()) {
    return truncateText(dataMessage);
  }

  const directMessage = error?.message;
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return truncateText(directMessage);
  }

  const errorName = error?.name;
  if (typeof errorName === 'string' && errorName.trim()) {
    return truncateText(errorName);
  }

  return truncateText(String(error));
};

export const extractLastErrorFromMessages = (messages) => {
  if (!Array.isArray(messages)) return '';

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.info?.role !== 'assistant') continue;

    const assistantError = extractErrorMessage(message?.info?.error);
    if (assistantError) return assistantError;

    const parts = Array.isArray(message.parts) ? message.parts : [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];

      if (part?.type === 'tool' && part.state?.status === 'error') {
        const toolError = extractErrorMessage(part.state?.error);
        if (toolError) return toolError;
        if (part.state?.title) return truncateText(`工具失败：${part.state.title}`);
      }
    }
  }

  return '';
};

export const WindowsNotifyPlugin = async ({ $, client }) => {
  const sessionCache = new Map();
  const rootActivity = new Map();
  const notifyingRoots = new Set();
  const rootErrors = new Map();
  const notifiedTaskErrors = new Set();
  const questionNotifications = new Map();
  const permissionNotifications = new Map();
  const QUESTION_TOOLS = new Set(['question', 'ask_user_question', 'askuserquestion']);

  const getShortSessionID = (sessionID) => sessionID.slice(0, 8);

  const isBusyStatus = (status) =>
    status === 'busy' || (typeof status === 'object' && status?.type === 'busy');

  const escapePowerShell = (value) => value.replace(/'/g, "''");

  const getQuestionText = (args) => {
    const questions = args?.questions;
    if (!Array.isArray(questions) || questions.length === 0) return '';
    const questionText = questions[0]?.question;
    return typeof questionText === 'string' ? truncateText(questionText) : '';
  };

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

  const getNotificationText = async (session, errorMessage = '') => {
    const label = session.title || session.slug || getShortSessionID(session.id);
    const changeSummary = formatChangeSummary(session);
    const messages = await listSessionMessages(session.id);
    const messageError = extractLastErrorFromMessages(messages);
    const lastResult = extractLastResultFromMessages(messages);
    const resolvedError = errorMessage || messageError;

    if (resolvedError) {
      return {
        title: `OpenCode · ${label}`,
        body: `出错啦：${resolvedError}`,
      };
    }

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

  const sendNotification = async (session, errorMessage = '') => {
    const { title, body } = await getNotificationText(session, errorMessage);
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

  const sendTextNotification = async (session, body) => {
    const label = session.title || session.slug || getShortSessionID(session.id);
    const script = [
      'Import-Module BurntToast',
      `$title = '${escapePowerShell(`OpenCode · ${label}`)}'`,
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

  const notifyRootSession = async (sessionID) => {
    let notifiedRootID = null;

    try {
      const rootSession = await getRootSessionInfo(sessionID);
      if (rootSession.id !== sessionID) return;
      if (!rootActivity.get(rootSession.id)) return;
      if (notifyingRoots.has(rootSession.id)) return;

      notifiedRootID = rootSession.id;
      notifyingRoots.add(rootSession.id);

      await sendNotification(rootSession, rootErrors.get(rootSession.id) ?? '');
      rootActivity.set(rootSession.id, false);
      rootErrors.delete(rootSession.id);
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
  };

  const notifyTaskSessionError = async (sessionID, errorMessage = '') => {
    if (notifiedTaskErrors.has(sessionID)) return;

    try {
      const session = await getSessionInfo(sessionID);
      if (!session.parentID) return;

      notifiedTaskErrors.add(sessionID);
      await sendNotification(session, errorMessage);
    } catch (error) {
      await logWarn('Failed to send task error notification', {
        sessionID,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const notifyQuestion = async (sessionID, callID, questionText) => {
    if (!callID || questionNotifications.has(callID)) return;

    try {
      const session = await getSessionInfo(sessionID);
      questionNotifications.set(callID, sessionID);
      await sendTextNotification(
        session,
        questionText ? `Agent 正在等你回答：${questionText}` : 'Agent 正在等你回答',
      );
    } catch (error) {
      await logWarn('Failed to send question notification', {
        sessionID,
        callID,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const notifyPermission = async (sessionID, permissionID, title) => {
    if (!permissionID || permissionNotifications.has(permissionID)) return;

    try {
      const session = await getSessionInfo(sessionID);
      permissionNotifications.set(permissionID, sessionID);
      await sendTextNotification(
        session,
        title ? `Agent 需要你的确认：${truncateText(title)}` : 'Agent 需要你的确认',
      );
    } catch (error) {
      await logWarn('Failed to send permission notification', {
        sessionID,
        permissionID,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const clearSessionNotificationState = (sessionID) => {
    notifiedTaskErrors.delete(sessionID);

    for (const [callID, trackedSessionID] of questionNotifications.entries()) {
      if (trackedSessionID === sessionID) {
        questionNotifications.delete(callID);
      }
    }

    for (const [permissionID, trackedSessionID] of permissionNotifications.entries()) {
      if (trackedSessionID === sessionID) {
        permissionNotifications.delete(permissionID);
      }
    }
  };

  return {
    'tool.execute.before': async (input, output) => {
      if (!QUESTION_TOOLS.has(input.tool)) return;
      await notifyQuestion(input.sessionID, input.callID, getQuestionText(output?.args));
    },
    'tool.execute.after': async (input) => {
      if (!QUESTION_TOOLS.has(input.tool)) return;
      questionNotifications.delete(input.callID);
    },
    event: async ({ event }) => {
      if (event.type === 'session.created' || event.type === 'session.updated') {
        const info = event.properties?.info;
        if (info?.id) {
          sessionCache.set(info.id, info);
        }
        return;
      }

      if (event.type === 'session.deleted') {
        const sessionID = event.properties?.info?.id;
        if (sessionID) {
          clearSessionNotificationState(sessionID);
        }
        return;
      }

      if (event.type === 'permission.updated' || event.type === 'permission.asked') {
        const permissionID = event.properties?.id;
        const sessionID = event.properties?.sessionID;
        if (!permissionID || !sessionID) return;
        await notifyPermission(sessionID, permissionID, event.properties?.title);
        return;
      }

      if (event.type === 'permission.replied') {
        const permissionID = event.properties?.permissionID;
        if (permissionID) {
          permissionNotifications.delete(permissionID);
        }
        return;
      }

      if (event.type === 'session.status') {
        const sessionID = event.properties?.sessionID;
        const status = event.properties?.status;

        if (!sessionID) return;

        if (status?.type === 'idle') {
          await notifyRootSession(sessionID);
          return;
        }

        if (!isBusyStatus(status)) return;

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

      if (event.type === 'session.error') {
        const sessionID = event.properties?.sessionID;
        if (!sessionID) return;

        try {
          const session = await getSessionInfo(sessionID);
          const errorMessage = extractErrorMessage(event.properties?.error);

          if (session.parentID) {
            await notifyTaskSessionError(sessionID, errorMessage);
            return;
          }

          const rootSession = await getRootSessionInfo(sessionID);
          rootActivity.set(rootSession.id, true);
          rootErrors.set(rootSession.id, errorMessage);
        } catch (error) {
          await logWarn('Failed to resolve root session for error event', {
            sessionID,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return;
      }

      if (event.type !== 'session.idle') return;

      const sessionID = event.properties?.sessionID;
      if (!sessionID) return;

      await notifyRootSession(sessionID);
    },
  };
};
