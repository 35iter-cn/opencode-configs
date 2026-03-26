export const WindowsNotifyPlugin = async ({ $, client }) => {
  const sessionCache = new Map();
  const rootActivity = new Map();
  const notifyingRoots = new Set();

  const getShortSessionID = (sessionID) => sessionID.slice(0, 8);

  const escapePowerShell = (value) => value.replace(/'/g, "''");

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

  const getNotificationText = (session) => {
    const label = session.title || session.slug || getShortSessionID(session.id);
    return {
      title: `OpenCode · ${label}`,
      body: `主会话已完成 · session ${getShortSessionID(session.id)}`,
    };
  };

  const sendNotification = async (session) => {
    const { title, body } = getNotificationText(session);
    const script = [
      'Import-Module BurntToast',
      `$title = '${escapePowerShell(title)}'`,
      `$body = '${escapePowerShell(body)}'`,
      'New-BurntToastNotification -Text $title, $body',
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

        if (!sessionID || status !== 'busy') return;

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
