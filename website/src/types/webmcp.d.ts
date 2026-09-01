/**
 * WebMCP (Model Context) — https://webmachinelearning.github.io/webmcp/
 * Chrome 149+: document.modelContext is canonical; navigator is deprecated alias.
 */
export {}

declare global {
  interface Document {
    readonly modelContext?: ModelContext
  }
  interface Navigator {
    /** @deprecated Prefer document.modelContext (Chrome 150+) */
    readonly modelContext?: ModelContext
  }
}

interface ModelContext {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): void | Promise<void>
  getTools?(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>
  executeTool?(
    tool: RegisteredTool,
    inputJson: string,
    options?: { signal?: AbortSignal },
  ): Promise<string | null>
}

interface RegisteredTool {
  name: string
  title?: string
  description?: string
  inputSchema?: object
  origin?: string
}

/** @see https://webmachinelearning.github.io/webmcp/ §4.2.1 */
interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: object
  /** Chrome Imperative API expects a DOMString return (often JSON text). */
  execute: (input: object, client: ModelContextClient) => Promise<unknown>
  annotations?: ToolAnnotations
}

interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal
  exposedTo?: string[]
}

interface ModelContextClient {
  signal?: AbortSignal
  requestUserInteraction?: (
    callback: () => Promise<unknown>,
  ) => Promise<unknown>
}
