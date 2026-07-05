export const site = {
  name: 'ClawQL',
  tagline: 'MCP server for API discovery and execution',
  description:
    'Token-efficient search → execute workflows over OpenAPI, Google Discovery, GraphQL, and gRPC — with vault memory, documents, and enterprise tooling.',
  earlyAccess: {
    badge: 'Managed hosting is in early access — accepting waitlist signups',
    summary:
      'ClawQL is open source and self-hostable today. Managed hosting (Free, Starter, Business, Dedicated) is onboarding its first tenants — founder-led setup, limited slots, sovereign inference on hosted plans.',
    pricingNote:
      'Managed tiers follow the June 2026 GTM model. We onboard Dedicated customers first, then Starter and Business shared slots as capacity grows. All managed tiers are early access — founder-led onboarding.',
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
