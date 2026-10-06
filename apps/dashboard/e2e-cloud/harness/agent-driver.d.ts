export function digestArgs(args: unknown): string

export function openaiChat(opts: {
  key: string
  model?: string
  messages?: unknown
  baseUrl?: string
}): Promise<{ status: number; body: Record<string, unknown> }>

export function mcpListTools(opts: {
  key: string
  baseUrl?: string
  client?: string
}): Promise<{ status: number; body: Record<string, unknown> }>

export function mcpCallTool(opts: {
  key: string
  name: string
  args?: Record<string, unknown>
  baseUrl?: string
}): Promise<{ status: number; body: Record<string, unknown>; digest: string }>

export function decisionCall(opts: {
  key: string
  site: string
  text?: string
  baseUrl?: string
}): Promise<{ status: number; body: Record<string, unknown> }>

export const KEYS: {
  legalOps: string
  supportBot: string
  releaseAgent: string
  docsPipeline: string
  engineering: string
  supportGroup: string
}

export const gateway: string
export const localGateway: string
