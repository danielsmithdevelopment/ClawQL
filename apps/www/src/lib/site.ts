export const site = {
  name: 'ClawQL',
  tagline: 'Agentic Infrastructure for Regulated Industries',
  description:
    'ClawQL is a governed MCP gateway for regulated work: search and execute APIs, vault memory, optional document pipelines, and a tamper-evident audit trail. Streams and clawql-tee are design/lab paths — labeled as such. Apache 2.0 packages in this repository.',
  earlyAccess: {
    badge: 'Early access waitlist — self-host free today',
    summary:
      'ClawQL is a governed MCP gateway — Protocol Fabric, vault memory, optional IDP, and tamper-evident audit (hash-chained; write-once where Object Lock is configured). Self-host free on the Apache 2.0 packages in this repository, or request early access for managed hosting.',
    pricingNote:
      'Self-host free on the Apache 2.0 packages in this repository, or request early access for managed hosting. One MCP endpoint on every tier. Managed prices are early-access figures, subject to change — see /pricing.',
  },
  waitlistPromise:
    'Request early access or self-host free with npx or Helm — Apache 2.0 packages in this repository, no license fee for those packages.',
  /** Public contact addresses — security matches SECURITY.md / security.txt. */
  emails: {
    general: 'hello@clawql.com',
    privacy: 'privacy@clawql.com',
    security: 'daniel@clawql.com',
  },
  urls: {
    home: '/',
    docs: 'https://docs.clawql.com',
    github: 'https://github.com/danielsmithdevelopment/ClawQL',
    releases: 'https://github.com/danielsmithdevelopment/ClawQL/releases',
    npm: 'https://www.npmjs.com/package/clawql-mcp',
    signup: '/signup',
    pricing: '/pricing',
    about: '/about',
    /** Equal-arm multi-gateway + Cloudflare multiturn benchmarks. */
    benchmarks: '/benchmarks',
    /** Crash durability narrative (lab v4 evidence) — full tables on /benchmarks#durability. */
    durability: '/durability',
    /** Typed ontology narrative — structured retrieval + policy status. */
    ontology: '/ontology',
    /** Governance narrative — outside-the-agent controls + measured boards. */
    governance: '/governance',
    /** ClawQL Cloud product narrative (early access + planned workloads). */
    cloud: '/cloud',
    /** Full integration catalog with verified statuses. */
    integrations: '/integrations',
    /** Practical data-handling narrative (pairs with /privacy-policy). */
    dataHandling: '/data-handling',
    /** Defense-in-depth security stack (marketing). */
    security: '/security',
    /** RFC 9116 security.txt */
    securityTxt: '/.well-known/security.txt',
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
    /** ClawQL Streams — event-driven agents + Protocol Fabric (see #fabric). */
    streams: '/streams',
    /** Protocol Fabric canonical marketing URL (section on Streams). */
    protocolFabric: '/streams#fabric',
    /** Agentic Platform marketing landing — Streams + ontology + /mcp-ui + TEE. */
    agents: '/agents',
    /** Secondary enterprise / Palantir-facing GTM motion. */
    enterpriseGtm: '/enterprise/gtm',
    privacy: '/privacy-policy',
    /** HTML contact page (agents: also /contact.md). */
    contact: '/contact',
    contactEmail: 'mailto:hello@clawql.com',
    /** Tamper-evident audit trail narrative (distinct from MCP `audit` tool). */
    audit: '/audit',
  },
  installCommand: 'npx clawql-mcp',
  /** Example providers — catalog is empty by default; opt in via CLAWQL_PROVIDER / providers.pack / CLAWQL_TIER. */
  providers: ['Cloudflare', 'GitHub', 'Slack', 'Linear', 'Notion', 'Onyx'],
  providersNote:
    'Provider catalog is empty by default in 8.0 — opt in with CLAWQL_PROVIDER=default, Helm providers.pack, or CLAWQL_TIER.',
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
