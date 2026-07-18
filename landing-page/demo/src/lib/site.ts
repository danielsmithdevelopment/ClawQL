export const site = {
  name: 'ClawQL',
  tagline: 'Operating system for agents',
  description:
    'ClawQL is the MCP operating system for agents — search and execute APIs, vault memory, and optional IDP on one gateway. Self-host free or start a trial.',
  earlyAccess: {
    badge: '14-day free trial — no credit card required',
    summary:
      'ClawQL is an operating system for agents — not an agent framework. The open-source MCP core is production-ready today: search, execute, vault memory, and optional IDP. Self-host free on Apache 2.0, or start a 14-day Developer trial with full persistent memory and unlimited executions.',
    pricingNote:
      'No perpetual free hosted plan — self-host free forever on Apache 2.0, or start a 14-day Developer trial. Gateway tiers deploy at the global edge with unlimited MCP executions, vault memory with no egress penalties on recall, and Onyx search on Teams. IDP tiers (Starter $299+) activate document processing, VDR, and sovereign inference on a dedicated tenant. One MCP endpoint for every tier: upgrade from Teams to Starter without changing your URL, auth token, or vault history.',
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
