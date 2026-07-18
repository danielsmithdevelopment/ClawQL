export const site = {
  name: 'ClawQL',
  tagline: 'Agentic Gateway for Auditable Production AI',
  description:
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, and Edge swarm. Self-host free or start a trial.',
  earlyAccess: {
    badge: '14-day free trial — no credit card required',
    summary:
      'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — not an agent framework. Land with OpenAI-compatible inference and MCP; expand into memory, Dedicated Virtual Gateway governance, and Edge Gateways on every laptop. Self-host free on Apache 2.0, or start a 14-day Developer trial.',
    pricingNote:
      'No perpetual free hosted plan — self-host free forever on Apache 2.0, or start a 14-day Developer trial. Gateway tiers run on multi-tenant Regional Hubs with unlimited MCP executions, vault memory with no egress penalties on recall, and Onyx search on Teams. IDP tiers (Starter $299+) activate document processing, VDR, and sovereign inference on a dedicated tenant. One Agentic Gateway endpoint for every tier: upgrade from Teams to Starter without changing your URL, auth token, or vault history.',
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
    /** Default / primary GTM motion — Agentic Gateway as Foundational Platform for Auditable Production AI. */
    inferenceGtm: '/inference/gtm',
    /** Secondary enterprise / Palantir-facing GTM motion. */
    enterpriseGtm: '/enterprise/gtm',
    privacy: '/privacy-policy',
    contact: 'mailto:hello@clawql.com',
  },
  installCommand: 'npm install -g clawql-mcp',
  providers: ['Cloudflare', 'GitHub', 'Slack', 'Linear', 'Notion', 'Onyx'],
} as const
