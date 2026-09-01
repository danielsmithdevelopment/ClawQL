/**
 * Ambient types for optional `posthog-node`.
 * Keeps `tsup` DTS green when the optionalDependency is omitted (e.g. MCP
 * Docker `npm ci` without optional install, or consumers who skip PostHog).
 */
declare module "posthog-node" {
  export class PostHog {
    constructor(
      apiKey: string,
      options?: {
        host?: string
        flushAt?: number
        flushInterval?: number
      },
    )
    capture(payload: {
      distinctId: string
      event: string
      properties?: Record<string, unknown>
      timestamp?: Date
    }): void
    identify(payload: {
      distinctId: string
      properties?: Record<string, unknown>
    }): void
    flush(): Promise<void>
    shutdown(): Promise<void>
  }
}
