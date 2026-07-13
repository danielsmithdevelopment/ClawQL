/**
 * WebMCP (Model Context) — https://webmachinelearning.github.io/webmcp/
 */
export {}

declare global {
  interface Navigator {
    readonly modelContext?: ModelContext
  }
}

interface ModelContext {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): void
}

interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: object
  execute: (input: object, client?: ModelContextClient) => Promise<unknown>
  annotations?: ToolAnnotations
}

interface ToolAnnotations {
  readOnlyHint?: boolean
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal
}

interface ModelContextClient {
  requestUserInteraction?: (callback: () => Promise<unknown>) => Promise<unknown>
}
