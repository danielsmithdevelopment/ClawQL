export const site = {
  name: 'ClawQL',
  tagline: 'Agentic Infrastructure for Regulated Industries',
  description:
    'ClawQL is agentic infrastructure for production work in regulated industries. Autonomous event-driven agents, structured institutional knowledge recall, hardware-verified trusted execution, and a WORM audit trail on every action. Apache 2.0.',
  earlyAccess: {
    badge: '14-day free trial — no credit card required',
    summary:
      'ClawQL is agentic infrastructure for production work in regulated industries — Protocol Fabric, Streams, structured memory, and TEE-ready audit. Self-host free on Apache 2.0, or start a 14-day Developer trial.',
    pricingNote:
      'Self-host free forever on Apache 2.0, or start a 14-day Developer trial. One MCP endpoint on every tier — same URL when you upgrade. Gateway tiers include vault memory; Teams adds Onyx; IDP tiers (Starter $299+) activate document processing on a dedicated tenant.',
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
    /** Agentic Platform marketing landing — Streams + ontology + /mcp-ui + TEE. */
    agents: '/agents',
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
