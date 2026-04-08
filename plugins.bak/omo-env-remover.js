export async function OmoEnvRemoverPlugin() {
  const OMO_ENV_BLOCK_RE = /<omo-env>[\s\S]*?<\/omo-env>/gi;

  return {
    hooks: {
      SystemPromptAssemble: async ({ system }) => {
        // 移除整个 <omo_env> 块，包括动态时间
        system.content = system.content.replace(OMO_ENV_BLOCK_RE, '').trim();
      },
    },
  };
}
