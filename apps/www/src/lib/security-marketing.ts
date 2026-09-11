/** Client-facing security pillars — aligned with docs.clawql.com/security. */
export const securityPillars = [
  {
    slug: 'golden-image',
    title: 'Golden image pipeline',
    body: 'OSV-Scanner, Trivy, and Syft SBOM gates run before any image publishes. One BuildKit build per image — the exact OCI layout scanned is what Cosign signs and pushes to GHCR. Failed scans block push, sign, and tag promotion.',
    href: 'https://docs.clawql.com/security',
    linkLabel: 'Pipeline overview',
  },
  {
    slug: 'admission',
    title: 'Admission enforcement',
    body: 'The Helm chart defaults Kyverno verifyImages for clawql-mcp and clawql-website. Unsigned or unverified digests are rejected before scheduling — deployed ClawQL images tie back to the signed artifacts from CI.',
    href: 'https://docs.clawql.com/security/defense-in-depth',
    linkLabel: 'Defense in depth',
  },
  {
    slug: 'agentic-ai',
    title: 'Built for agentic AI',
    body: '32-module security curriculum from supply chain through runtime. MCP gateway ATR scoping limits what agents can do regardless of prompt injection; audit trails, sandbox isolation, and distroless images are documented for self-hosted k3s.',
    href: 'https://docs.clawql.com/security/best-practices',
    linkLabel: '32-module curriculum',
  },
  {
    slug: 'verify-yourself',
    title: 'Reproduce it yourself',
    body: 'Security documentation is public: golden-image walkthroughs, deliverables matrix, npm supply-chain hardening, and cosign verify instructions. Operators and reviewers can reproduce CI gates — we document limits as clearly as controls.',
    href: 'https://docs.clawql.com/security',
    linkLabel: 'Full security hub',
  },
] as const

export const securityEnforcementLayers = [
  { layer: 'GitHub Actions', outcome: 'Failed OSV/Trivy/SBOM or image scan → no push, no sign' },
  { layer: 'GHCR + Sigstore', outcome: 'Cosign keyless signatures bind to the digest that passed CI' },
  { layer: 'Kubernetes', outcome: 'Kyverno verifyImages rejects unsigned ClawQL images at admission' },
] as const
