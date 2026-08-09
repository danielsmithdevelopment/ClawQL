import type { ReferenceCard } from '@/components/ReferenceResourceCard'
import { BellIcon } from '@/components/icons/BellIcon'
import { BoltIcon } from '@/components/icons/BoltIcon'
import { BookIcon } from '@/components/icons/BookIcon'
import { ChatBubbleIcon } from '@/components/icons/ChatBubbleIcon'
import { ClipboardIcon } from '@/components/icons/ClipboardIcon'
import { CogIcon } from '@/components/icons/CogIcon'
import { DocumentIcon } from '@/components/icons/DocumentIcon'
import { LinkIcon } from '@/components/icons/LinkIcon'
import { ListIcon } from '@/components/icons/ListIcon'
import { MagnifyingGlassIcon } from '@/components/icons/MagnifyingGlassIcon'
import { MapPinIcon } from '@/components/icons/MapPinIcon'
import { PackageIcon } from '@/components/icons/PackageIcon'
import { ShapesIcon } from '@/components/icons/ShapesIcon'
import { SquaresPlusIcon } from '@/components/icons/SquaresPlusIcon'
import { TagIcon } from '@/components/icons/TagIcon'

const card = (
  partial: Omit<ReferenceCard, 'pattern'> & {
    pattern?: ReferenceCard['pattern']
  },
): ReferenceCard => ({
  pattern: { y: 12, squares: [[0, 1]] },
  ...partial,
})

/**
 * Hub ownership (P1): each href appears in at most one hub grid.
 * Architecture owns vision/status + platform products.
 * Deployment owns ops/infra.
 * Reference owns contracts/tools/config.
 * Resources owns meta (changelog, github).
 * Learn uses docs-site-card-data.ts for module cards.
 */

/** Former case studies — Examples hub only. */
export const exampleSiteCards: Array<ReferenceCard> = [
  card({
    href: '/case-studies/cloudflare-docs-mcp',
    name: 'Example: Cloudflare docs deploy',
    description:
      'MCP workflow for docs.clawql.com: search, execute, vault memory, and Worker runtime triage.',
    icon: BookIcon,
  }),
  card({
    href: '/case-studies/vault-memory-github-session-2026-04',
    name: 'Example: Vault + GitHub session',
    description:
      'memory_ingest at scale, issue triage, and shipping enterprise audit tooling with docs.',
    icon: BookIcon,
  }),
  card({
    href: '/case-studies/cross-thread-vault-recall',
    name: 'Example: Cross-thread vault recall',
    description:
      'Repo search vs memory_recall — Obsidian graph, wikilinks, and session resume patterns.',
    icon: BookIcon,
  }),
  card({
    href: '/case-studies/truenas-scale-corgicave-homelab',
    name: 'Example: TrueNAS homelab',
    description:
      'TrueNAS SCALE island: Docker/K8s networking, vault tools, and full triage ladder.',
    icon: BookIcon,
  }),
  card({
    href: '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04',
    name: 'Example: Worker 1102 incident',
    description:
      'docs.clawql.com Error 1102 postmortem; MCP on Cloudflare APIs; prevention runbook.',
    icon: BookIcon,
  }),
  card({
    href: '/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04',
    name: 'Example: Deck parity session',
    description:
      'memory_recall before filing issues; cache scratch state; vault ingest to close the loop.',
    icon: BookIcon,
  }),
  card({
    href: '/case-studies/openclaw-clawql-memory-recall-2026-06',
    name: 'Example: OpenClaw memory_recall',
    description:
      'Agent gateway chat calls clawql__memory_recall; verbatim transcript; cross-session vault knowledge for solo builders.',
    icon: BookIcon,
  }),
]

/** Architecture hub — status + platform stories (not ops or MCP tool refs). */
export const architectureHubCards: Array<ReferenceCard> = [
  card({
    href: '/architecture/agentic-fabric',
    name: 'Zero-Trust Agentic Fabric',
    description:
      'Agentic Gateway as Foundational Platform — Regional Hubs, Dedicated Virtual Gateways (NATS/Valkey), Edge swarm.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/architecture/enterprise-ontology',
    name: 'Enterprise Ontology',
    description:
      'Open YAML/OKF typed entities, kinetic @kinetic actions, Git vs R2 — OpenBench B-7 proof that typed predicates beat memory alone.',
    icon: DocumentIcon,
  }),
  card({
    href: '/specs/memory/memory-recall-structured-filter',
    name: 'memory_recall structured filters',
    description:
      'How and why memory_recall gained schema + filters via clawql-ontology — exact enumeration without semantic near-misses.',
    icon: DocumentIcon,
  }),
  card({
    href: '/specs/ontology/legal-domain',
    name: 'Legal domain ontology',
    description:
      'Matter / Client / Attorney / Document pack that backs ontology.db for structured recall.',
    icon: DocumentIcon,
  }),
  card({
    href: '/specs/cq-extensions',
    name: '.cq* file extensions',
    description:
      'Draft Apache 2.0 specs for .cqe, .cqm, .cqk, and .cqw (ADR 0010).',
    icon: DocumentIcon,
  }),
  card({
    href: '/vision/roadmap',
    name: 'Vision & status',
    description: 'Honest shipped vs planned status and phased delivery.',
    icon: BookIcon,
  }),
  card({
    href: '/concepts',
    name: 'Core concepts',
    description:
      'search/execute architecture, feature tiers, and token-saving design.',
    icon: ShapesIcon,
  }),
  card({
    href: '/architecture/token-efficiency',
    name: 'Token efficiency',
    description:
      'Twelve compounding layers for agent cost and reasoning quality.',
    icon: BoltIcon,
  }),
  card({
    href: '/getting-started/immutable-releases',
    name: 'Immutable releases',
    description:
      'Friendly dry-run first: publish, verify, and pull a release you can trust — permanence optional.',
    icon: LinkIcon,
  }),
  card({
    href: '/vision/idp-platform',
    name: 'IDP platform',
    description:
      'Document pipeline product story — self-hosted vs hosted IDP, archive, VDR.',
    icon: DocumentIcon,
  }),
  card({
    href: '/ouroboros',
    name: 'Ouroboros',
    description:
      'Shipped evolutionary-loop library and optional ouroboros_* MCP tools.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/plugins',
    name: 'Plugins',
    description:
      'Horizontal building blocks and domain vertical presets (.cqw boilerplate).',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/getting-started/inference',
    name: 'Inference setup',
    description:
      'Five-minute clawql-inference runbook — BYOK /v1, MCP + memory, then deep reference.',
    icon: BoltIcon,
  }),
  card({
    href: '/getting-started/custom-sources',
    name: 'Custom sources (MCP gateway)',
    description:
      'Register other MCP servers and APIs into one search/execute surface — permit and lock down with Seatbelt / Panguard.',
    icon: LinkIcon,
  }),
  card({
    href: '/inference/clawql-inference',
    name: 'Agentic Gateway (clawql-inference)',
    description:
      'OpenAI-compatible /v1 + MCP entry to the Foundational Platform — routing, cache, flywheel, WORM path.',
    icon: BoltIcon,
  }),
  card({
    href: '/payments/clawql-payments',
    name: 'Payments',
    description:
      'Stripe, x402, MPP, and related rails — plan entitlements and WORM audit.',
    icon: TagIcon,
  }),
  card({
    href: '/surveillance/clawql-surveillance',
    name: 'Surveillance (spec)',
    description:
      'Planned vertical: HSE attestation, Merkle/WORM audit, Arweave anchors, case-number enforcement.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/streams/clawql-streams',
    name: 'ClawQL Streams (draft)',
    description:
      'Event-driven autonomous agents — WebSocket/NATS triggers, WORM audit, DO or K8s scale.',
    icon: BoltIcon,
  }),
  card({
    href: '/streams/clawql-durable-objects',
    name: 'Durable Objects (draft)',
    description:
      'Streams session runtime — Audit / Inference / Training sidecars, virtual key lifecycle.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/streams/clawql-cellrt',
    name: 'clawql-cellrt (draft)',
    description:
      'ClawQL-owned Rust + Wasmtime cell runtime — LTX WORM, Vault, WASM sandbox, HTTP bootstrap.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/streams/clawql-tee',
    name: 'clawql-tee (draft)',
    description:
      'Hardware TEE for cellrt — SEV-SNP/TDX attestation, Vault-gated secrets, optional GPU CC.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/streams/clawql-tee-airgap-audit',
    name: 'TEE air-gap audit (draft)',
    description:
      'Unidirectional QR streaming of WORM + attestation for regulator verification.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/streams/clawql-qr-stream-transport',
    name: 'QR stream transport (draft)',
    description:
      '7th mcp-api-adapter surface + Streams qr source — air-gap MCP and election ballots.',
    icon: BoltIcon,
  }),
  card({
    href: '/government/clawql-government',
    name: 'clawql-government (draft)',
    description:
      'Outcome accountability — Arweave baselines, bond validation, FOIA vault, auditor API.',
    icon: SquaresPlusIcon,
  }),
]

/** Deployment hub — ops/infra only (not getting-started entry points). */
export const deploymentHubCards: Array<ReferenceCard> = [
  card({
    href: '/deployment/operations-guide',
    name: 'Operations guide',
    description: 'Day-2 ops, health, secrets, and Helm paths.',
    icon: BookIcon,
  }),
  card({
    href: '/deployment/kubernetes',
    name: 'Kubernetes & Helm',
    description: 'Docker Desktop local cluster, chart, Kustomize.',
    icon: MapPinIcon,
  }),
  card({
    href: '/helm',
    name: 'Helm chart reference',
    description: 'charts/clawql-mcp values, Ingress, GHCR images.',
    icon: PackageIcon,
  }),
  card({
    href: '/docker-desktop-observability',
    name: 'Istio & observability lab',
    description: 'Prometheus, Grafana, Tempo, Kiali, OTel on Desktop.',
    icon: BookIcon,
  }),
  card({
    href: '/tailscale',
    name: 'Private tailnet access',
    description: 'Tailscale / Headscale for remote MCP without public ingress.',
    icon: MapPinIcon,
  }),
  card({
    href: '/dashboard-kubernetes',
    name: 'Dashboard on Kubernetes',
    description: 'Bundled dashboard UI, Vault sync, and Helm wiring.',
    icon: CogIcon,
  }),
  card({
    href: '/openclaw',
    name: 'OpenClaw + ClawQL',
    description: 'Register clawql-mcp in OpenClaw — HTTP/stdio and smoke path.',
    icon: LinkIcon,
  }),
]

/**
 * @deprecated Guides site route redirects to /learn. Kept for compile safety if imported.
 * Prefer LearnCardSections / reference / architecture hubs.
 */
export const guidesHubCards: Array<ReferenceCard> = [
  card({
    href: '/learn',
    name: 'ClawQL Learn',
    description: 'Hands-on modules — start here for guided walkthroughs.',
    icon: BookIcon,
  }),
  card({
    href: '/security/defense-in-depth',
    name: 'Defense in depth',
    description: 'Deployment security reference — supply chain through audit.',
    icon: ShapesIcon,
  }),
  card({
    href: '/security/best-practices',
    name: 'Security curriculum',
    description: 'Vendor-neutral training modules.',
    icon: ShapesIcon,
  }),
]

/** Reference hub — tools, config, contracts (not vision/status). */
export const referenceHubCards: Array<ReferenceCard> = [
  card({
    href: '/reference/protocol',
    name: 'Protocol reference',
    description: 'Uniform envelope, approval flows, HATEOAS.',
    icon: DocumentIcon,
  }),
  card({
    href: '/tools',
    name: 'MCP tools',
    description: 'search, execute, audit, cache, memory, optional tools.',
    icon: BoltIcon,
  }),
  card({
    href: '/mcp/mcp-api-adapter',
    name: 'mcp-api-adapter',
    description:
      'Any MCP server → OpenAPI, GraphQL, /mcp, gRPC, gen-cli (in-repo; npm pending).',
    icon: PackageIcon,
  }),
  card({
    href: '/mcp/protocol-fabric',
    name: 'Protocol Fabric',
    description:
      'Any protocol ↔ any protocol via MCP — proven WS → CLI → REST → vault loop.',
    icon: LinkIcon,
  }),
  card({
    href: '/spec-configuration',
    name: 'Configuration',
    description: 'CLAWQL_* env vars, spec loading, provider presets.',
    icon: CogIcon,
  }),
  card({
    href: '/plugins',
    name: 'Plugins',
    description:
      'Searchable registry — horizontal building blocks and vertical presets.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/reference/optional-tools',
    name: 'Optional tools hub',
    description: 'Cache, schedule, notify, Onyx, sandbox walkthroughs.',
    icon: ClipboardIcon,
  }),
  card({
    href: '/bundled-specs',
    name: 'Bundled API specs',
    description: 'Provider presets and CLAWQL_PROVIDER values.',
    icon: PackageIcon,
  }),
  card({
    href: '/graphql-proxy',
    name: 'GraphQL layer',
    description: 'OpenAPI→GraphQL projection vs native GraphQL sources.',
    icon: CogIcon,
  }),
  card({
    href: '/nats-jetstream',
    name: 'NATS JetStream',
    description: 'Optional event backbone for coordination.',
    icon: MapPinIcon,
  }),
  card({
    href: '/contributing/technical-specification',
    name: 'Contributor spec',
    description: 'Implementation contracts, Effect-TS, CRD fields, CI.',
    icon: BookIcon,
  }),
  card({
    href: '/benchmarks',
    name: 'Benchmarks',
    description: 'Planning-context comparisons and workflow artifacts.',
    icon: ListIcon,
  }),
]

/** Resources hub — meta only. */
export const resourcesHubCards: Array<ReferenceCard> = [
  card({
    href: '/resources/changelog',
    name: 'Changelog & releases',
    description: 'Major versions and GitHub release notes.',
    icon: TagIcon,
  }),
  card({
    href: '/troubleshooting',
    name: 'Troubleshooting',
    description: 'Common MCP, spec, auth, and deploy failure modes.',
    icon: TagIcon,
  }),
  card({
    href: '/vision/slide-deck',
    name: 'Slide deck',
    description: 'Presentation overview — not a how-to guide.',
    icon: BookIcon,
  }),
  card({
    href: 'https://github.com/danielsmithdevelopment/ClawQL',
    name: 'GitHub repository',
    description: 'Source, issues, discussions, and contribution workflow.',
    icon: LinkIcon,
  }),
  card({
    href: 'https://www.npmjs.com/package/clawql-mcp',
    name: 'npm: clawql-mcp',
    description: 'Published MCP server package.',
    icon: PackageIcon,
  }),
]

export const optionalToolsHubCards: Array<ReferenceCard> = [
  card({
    href: '/learn/cache-handoff-between-chats',
    name: 'Session cache',
    description: 'Core cache tool — ephemeral scratch state between chats.',
    icon: ClipboardIcon,
  }),
  card({
    href: '/learn/schedule-notify-workflows',
    name: 'Schedule & notify',
    description: 'Synthetic checks and Slack notifications.',
    icon: BellIcon,
  }),
  card({
    href: '/learn/audit-tool-and-observability',
    name: 'Audit & observability',
    description: 'In-process audit ring buffer and metrics integration.',
    icon: ListIcon,
  }),
  card({
    href: '/learn/knowledge-search-onyx',
    name: 'Onyx knowledge search',
    description: 'Enterprise semantic search via knowledge_search_onyx.',
    icon: MagnifyingGlassIcon,
  }),
  card({
    href: '/learn/sandbox-exec',
    name: 'Sandbox exec',
    description:
      'MCP sandbox_exec — Kata, Docker, Seatbelt, or Cloudflare bridge.',
    icon: ShapesIcon,
  }),
  card({
    href: '/hitl-label-studio',
    name: 'HITL — Label Studio',
    description: 'Human review queues and webhook callbacks.',
    icon: BellIcon,
  }),
  card({
    href: '/learn/memory',
    name: 'clawql-memory',
    description:
      'Durable memory_ingest / memory_recall, PageIndex, and optional code graph.',
    icon: ChatBubbleIcon,
  }),
]

/** One card per plugin page under /plugins — synced from docs/plugins/*.md */
export const pluginsHubCards: Array<ReferenceCard> = [
  card({
    href: '/plugins/core',
    name: 'Gateway core',
    description: 'search, execute, audit, cache — always composed, no opt-out.',
    icon: BoltIcon,
  }),
  card({
    href: '/plugins/panguard-proxy',
    name: 'Panguard MCP proxy',
    description: 'beforeCallTool policy chokepoint for enterprise MCP defense.',
    icon: ShapesIcon,
  }),
  card({
    href: '/plugins/memory',
    name: 'Memory (vault)',
    description: 'memory_ingest / memory_recall — default on, Obsidian vault.',
    icon: ChatBubbleIcon,
  }),
  card({
    href: '/plugins/codegraph',
    name: 'Code graph',
    description:
      'codegraph_* — structural AST indexing, Graphify import, hybrid recall.',
    icon: ShapesIcon,
  }),
  card({
    href: '/plugins/documents',
    name: 'Documents & IDP',
    description: 'ingest_external_knowledge, Onyx search, optional IDP tools.',
    icon: DocumentIcon,
  }),
  card({
    href: '/plugins/bundled-providers',
    name: 'Bundled providers',
    description:
      'Default stack: Cloudflare, GitHub, Slack, Linear, Notion, Onyx.',
    icon: PackageIcon,
  }),
  card({
    href: '/plugins/automation',
    name: 'Automation',
    description: 'schedule, notify, workflow, argocd — each opt-in via env.',
    icon: BellIcon,
  }),
  card({
    href: '/plugins/sandbox',
    name: 'Sandbox',
    description:
      'sandbox_exec MCP + clawql sandbox CLI — Kata, Seatbelt, fail-closed harnesses.',
    icon: ShapesIcon,
  }),
  card({
    href: '/plugins/ouroboros',
    name: 'Ouroboros',
    description: 'Evolutionary loop MCP tools and optional Postgres lineage.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/plugins/inference-providers',
    name: 'Inference providers',
    description:
      'OpenAI, Anthropic, Ollama builtins and third-party clawql-inference plugins.',
    icon: BoltIcon,
  }),
  card({
    href: '/plugins/hitl-label-studio',
    name: 'HITL (Label Studio)',
    description: 'Human-in-the-loop review — planned full plugin wiring.',
    icon: BellIcon,
  }),
  card({
    href: '/plugins/third-party',
    name: 'Third-party plugins',
    description: 'Roadmap and checklist for external clawql-* npm plugins.',
    icon: LinkIcon,
  }),
]
