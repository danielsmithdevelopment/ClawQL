/** Optional peer — present when @opencode-ai/sdk is installed. */
declare module "@opencode-ai/sdk" {
  export function createOpencode(options?: {
    hostname?: string;
    port?: number;
    config?: Record<string, unknown>;
  }): Promise<{
    client: {
      session: {
        create: (opts?: unknown) => Promise<{ data?: { id?: string }; error?: unknown }>;
        prompt: (opts: unknown) => Promise<{ data?: unknown; error?: unknown }>;
      };
    };
    server: { url: string; close(): void };
  }>;
}

declare module "@opencode-ai/sdk/v2" {
  export function createOpencode(options?: {
    hostname?: string;
    port?: number;
    config?: Record<string, unknown>;
  }): Promise<{
    client: {
      session: {
        create: (opts?: unknown) => Promise<{ data?: { id?: string }; error?: unknown }>;
        prompt: (opts: unknown) => Promise<{ data?: unknown; error?: unknown }>;
      };
    };
    server: { url: string; close(): void };
  }>;
}

declare module "@opencode-ai/plugin" {
  export const Plugin: {
    define: (def: { id: string; setup: (ctx: unknown) => Promise<void> }) => unknown;
  };
}
