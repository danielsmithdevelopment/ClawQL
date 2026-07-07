export const site = {
  name: 'ClawQL',
  tagline: 'MCP server for API discovery and execution',
  description:
    'Token-efficient search → execute workflows over OpenAPI, Google Discovery, GraphQL, and gRPC — with vault memory, documents, and enterprise tooling.',
  earlyAccess: {
    badge: 'Managed hosting is in early access — accepting waitlist signups',
    summary:
      'ClawQL is open source and self-hostable today. Gateway tiers (Free, Developer, Teams) launch at the global edge with unlimited executions and vault memory. IDP document processing provisions dedicated infrastructure when you opt into Starter+. Founder-led onboarding, limited slots.',
    pricingNote:
      'Gateway tiers deploy at the global edge first — unlimited MCP executions, vault memory with no egress penalties on recall, Onyx search on Teams. IDP tiers (Starter $299+) activate document processing, VDR, and sovereign inference on a dedicated tenant. One MCP endpoint for every tier: upgrade from Teams to Starter without changing your URL, auth token, or vault history.',
  },
  waitlistPromise:
    'Join the waitlist for managed hosting — we reply personally when a slot opens. Self-host free with npm or Helm while you wait.',
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
