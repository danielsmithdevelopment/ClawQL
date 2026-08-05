export const site = {
  name: 'ClawQL',
  tagline: 'Agentic Gateway for Auditable Production AI',
  description:
    'Token-efficient search → execute workflows over OpenAPI, Google Discovery, GraphQL, and gRPC — with vault memory, documents, and enterprise tooling.',
  earlyAccess: {
    badge: '14-day free trial — no credit card required',
    summary:
      'ClawQL is the open-source MCP core for production agent work: search, execute, vault memory, and optional IDP. Self-host free on Apache 2.0, or start a 14-day Developer trial with full persistent memory and unlimited executions.',
    pricingNote:
      'Self-host free forever on Apache 2.0, or start a 14-day Developer trial. Gateway tiers deploy at the global edge with unlimited MCP executions, vault memory with no egress penalties on recall, and Onyx search on Teams. IDP tiers (Starter $299+) activate document processing, VDR, and sovereign inference on a dedicated tenant. One MCP endpoint for every tier: upgrade from Teams to Starter and your URL, auth token, and vault history stay the same.',
  },
  waitlistPromise:
    'Start your 14-day trial or self-host free with npm or Helm — full Apache 2.0 stack, no license fee.',
  urls: {
    home: '/',
    docs: 'https://docs.clawql.com',
    github: 'https://github.com/danielsmithdevelopment/ClawQL',
    releases: 'https://github.com/danielsmithdevelopment/ClawQL/releases',
    npm: 'https://www.npmjs.com/package/clawql-mcp',
    signup: '/signup',
    pricing: '/pricing',
    about: '/about',
    /** Interactive edge demo (no signup) — sandboxed 5-minute session. */
    demo: '/demo',
    /** Public status surface (gateway health + components). */
    status: '/status',
    /** X / Twitter — GTM Phase 1 footer checklist. */
    twitter: 'https://x.com/clawql',
    /** Default / primary GTM motion — Agentic Gateway as Foundational Platform for Auditable Production AI. */
    inferenceGtm: '/inference/gtm',
    /** Public IDP-first marketing landing (ops / compliance buyers). */
    idp: '/idp',
    /** IDP-first GTM playbook — strategy source of truth for the IDP motion. */
    idpGtm: '/idp/gtm',
    /** ClawQL Streams — event-driven autonomous agents / Protocol Fabric. */
    streams: '/streams',
    /** Secondary enterprise / Palantir-facing GTM motion. */
    enterpriseGtm: '/enterprise/gtm',
    privacy: '/privacy-policy',
    contact: 'mailto:hello@clawql.com',
  },
  installCommand: 'npm install -g clawql-mcp',
  providers: ['Cloudflare', 'GitHub', 'Slack', 'Linear', 'Notion', 'Onyx'],
} as const

/** Edge gateway origin — override with NEXT_PUBLIC_CLAWQL_GATEWAY_URL at build time. */
export const gatewayUrl = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (globalThis as any)?.process?.env as Record<string, string | undefined> | undefined
    return env?.NEXT_PUBLIC_CLAWQL_GATEWAY_URL?.trim() || 'https://gateway.clawql.app'
  } catch {
    return 'https://gateway.clawql.app'
  }
})()