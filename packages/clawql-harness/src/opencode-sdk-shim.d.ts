/** Optional peer — present when @opencode-ai/sdk is installed. */
declare module "@opencode-ai/sdk" {
  export const OpenCode: {
    create: (opts: { plugins?: unknown[] }) => Promise<{ close?: () => Promise<void> }>;
  };
}

declare module "@opencode-ai/plugin" {
  export const Plugin: {
    define: (def: { id: string; setup: (ctx: unknown) => Promise<void> }) => unknown;
  };
}
