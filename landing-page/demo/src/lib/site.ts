export const site = {
  name: 'ClawQL',
  tagline: 'MCP server for API discovery and execution',
  description:
    'Token-efficient search → execute workflows over OpenAPI, Google Discovery, GraphQL, and gRPC — with vault memory, documents, and enterprise tooling.',
  earlyAccess: {
    badge: 'Managed hosting is in early access — accepting waitlist signups',
    summary:
      'ClawQL is open source and self-hostable today. Managed hosting uses plugin bundles — gateway + memory from $29/mo, IDP document processing from $299/mo — with founder-led onboarding and limited slots.',
    pricingNote:
      'Gateway tiers (Developer $29, Teams $99) compete on MCP executions and vault memory. IDP tiers (Starter $299+) activate document processing, VDR, and sovereign inference explicitly. All managed tiers are early access with founder-led onboarding.',
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
