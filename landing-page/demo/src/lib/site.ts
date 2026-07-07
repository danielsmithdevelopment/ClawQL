export const site = {
  name: 'ClawQL',
  tagline: 'MCP server for API discovery and execution',
  description:
    'Token-efficient search → execute workflows over OpenAPI, Google Discovery, GraphQL, and gRPC — with vault memory, documents, and enterprise tooling.',
  earlyAccess: {
    badge: '14-day free trial — no credit card required',
    summary:
      'ClawQL is open source and self-hostable today — that is your free tier. Hosted gateway starts with a 14-day trial of Developer: full persistent vault, unlimited executions, global edge endpoint. Upgrade to Teams or IDP tiers when you are ready.',
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
    privacy: '/privacy-policy',
    contact: 'mailto:hello@clawql.com',
  },
  installCommand: 'npm install -g clawql-mcp',
  providers: ['GitHub', 'Google Cloud', 'Atlassian', 'Slack', 'Linear', 'Cloudflare'],
} as const
