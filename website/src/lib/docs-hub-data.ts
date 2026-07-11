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

/** Former case studies — reframed as workflow examples until production vertical stories ship. */
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

export const architectureHubCards: Array<ReferenceCard> = [
  card({
    href: '/vision/roadmap',
    name: 'Vision & Roadmap',
    description: 'Honest shipped vs planned status and phased delivery.',
    icon: BookIcon,
  }),
  card({
    href: '/vision/ecosystem',
    name: 'Ecosystem map',
    description:
      'Core loop, hybrid memory, IDP pipeline, infra map — shipped vs roadmap appendix.',
    icon: BookIcon,
  }),
  card({
    href: '/vision/idp-platform',
    name: 'IDP Platform',
    description:
      'Self-hosted vs hosted IDP, ClawQL-native archive layer, VDR, Merkle audit.',
    icon: DocumentIcon,
  }),
  card({
    href: '/vision/technical-enablement',
    name: 'Master enablement guide',
    description:
      'v2.1 unified 6-layer architecture and documentation suite index.',
    icon: ShapesIcon,
  }),
  card({
    href: '/vision/modularization',
    name: 'Modularization v2.1',
    description:
      'Package boundaries, dependency graph, and intelligent MCP gateway.',
    icon: PackageIcon,
  }),
  card({
    href: '/reference/plugins',
    name: 'Plugin model & registry',
    description:
      'Horizontal plugins, MCP tool ownership, shipped vs planned registry.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/plugins',
    name: 'Plugins hub',
    description:
      'Dedicated page per plugin — core, memory, documents, providers, automation, sandbox, Ouroboros.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/vision/immutable-releases',
    name: 'Immutable releases (Layer 0)',
    description:
      'Arweave bundles, Radicle, Rift, clawql-release, and release manifest.',
    icon: LinkIcon,
  }),
  card({
    href: '/ouroboros/daos',
    name: 'DAOS Unified Architecture',
    description:
      '7-layer platform v2.7: Manifest, PEP, Memory 2.0, Ouroboros, Circuit Breaker.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/ouroboros/specification',
    name: 'DAOS coordination layer',
    description:
      'NATS handoff, NSV/SGDOP diversity metrics, Diversity Dividends, Coordinator.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/ouroboros',
    name: 'Ouroboros library',
    description:
      'NSV/SGDOP strategic coordination and optional ouroboros_* MCP tools.',
    icon: SquaresPlusIcon,
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
    name: 'Token efficiency (8 layers)',
    description: 'Code Mode through classification-aware model routing.',
    icon: BoltIcon,
  }),
]

export const deploymentHubCards: Array<ReferenceCard> = [
  card({
    href: '/deployment/operations-guide',
    name: 'Deployment & Operations Guide',
    description:
      'Full Tier 1–3 reference: CRDs, auth, day-2 ops, troubleshooting.',
    icon: BookIcon,
  }),
  card({
    href: '/quickstart',
    name: 'Tier 1: Quickstart (npx / Compose)',
    description: 'Fastest path — run clawql-mcp locally in minutes.',
    icon: BoltIcon,
  }),
  card({
    href: '/getting-started/phase-1-platform-guide',
    name: 'Phase 1 platform guide (7.0)',
    description:
      'Auth, PageIndex, Presidio hooks, Tier 1 Compose, and release manifest.',
    icon: BookIcon,
  }),
  card({
    href: '/getting-started/for-teams',
    name: 'Getting started for teams',
    description:
      'Shared object storage for Memory notes, Prometheus metrics, Loki audit, OTEL traces, Langfuse.',
    icon: BookIcon,
  }),
  card({
    href: '/getting-started/team-vault-sync',
    name: 'Team vault sync (R2 / S3 / GCS)',
    description:
      'clawql sync push/pull, auto sync on memory_ingest/recall, Helm teamSync values.',
    icon: BookIcon,
  }),
  card({
    href: '/getting-started/cursor-ios-cloud-agent',
    name: 'Cursor iOS + Cloud Agent',
    description:
      'ClawQL from the Cursor iOS app — stdio MCP on the agent VM, team bucket, memory_sync.',
    icon: BookIcon,
  }),
  card({
    href: '/getting-started/golden-host-images',
    name: 'Golden host images (Packer + Pulumi)',
    description:
      'Managed tiers: Packer bakes AMIs/GCP images; Pulumi provisions EC2/GCE/R2 with boot-time team vault.',
    icon: MapPinIcon,
  }),
  card({
    href: '/getting-started/local-agent-sandbox',
    name: 'Local agent sandbox',
    description:
      'clawql sandbox init — fail-closed Seatbelt for Codex, Claude, Cursor, OpenCode harnesses.',
    icon: ShapesIcon,
  }),
  card({
    href: '/deployment/kubernetes',
    name: 'Tier 2: Kubernetes & Helm',
    description:
      'Docker Desktop local cluster, Helm chart, Kustomize dev/prod.',
    icon: MapPinIcon,
  }),
  card({
    href: '/helm',
    name: 'Helm chart reference',
    description:
      'charts/clawql-mcp values, Ingress, GHCR images, optional PVC.',
    icon: PackageIcon,
  }),
  card({
    href: '/docker-desktop-observability',
    name: 'Tier 3: Istio & observability lab',
    description:
      'Prometheus, Grafana, Tempo, Kiali, OTel — enterprise patterns on Desktop.',
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
    description: 'Gateway product integration and bootstrap checklist.',
    icon: LinkIcon,
  }),
]

export const guidesHubCards: Array<ReferenceCard> = [
  card({
    href: '/getting-started/clawql-7-setup-guide',
    name: '7.0 setup & migration',
    description:
      'Install paths, env vars, plugin enablement, and verification for ClawQL 7.0.',
    icon: BookIcon,
  }),
  card({
    href: '/learn',
    name: 'ClawQL Learn',
    description:
      'Step-by-step modules: search/execute, vault, sandbox, Ouroboros, OpenClaw.',
    icon: BookIcon,
  }),
  card({
    href: '/architecture/token-efficiency',
    name: 'Token efficiency',
    description:
      'Eight compounding layers — primary cost control for agent workloads.',
    icon: BoltIcon,
  }),
  card({
    href: '/security/defense-in-depth',
    name: 'Defense in depth',
    description:
      'Condensed deployment security reference — supply chain through audit.',
    icon: ShapesIcon,
  }),
  card({
    href: '/security/best-practices',
    name: 'Security curriculum (32 modules)',
    description:
      'Vendor-neutral training — ATR, Presidio, egress, red team, compliance.',
    icon: ShapesIcon,
  }),
  card({
    href: '/reference/hitl',
    name: 'HITL & human interfaces',
    description: 'Approval flows, Label Studio, HATEOAS + htmx patterns.',
    icon: BellIcon,
  }),
  card({
    href: '/reference/verticals',
    name: 'Verticals guide',
    description:
      'Enabling lending, legal, and other vertical packages — from the contributor spec.',
    icon: PackageIcon,
  }),
  card({
    href: '/learn/schedule-notify-workflows',
    name: 'Schedule & notify',
    description: 'Synthetic checks, Slack notify, and automation workflows.',
    icon: BellIcon,
  }),
  card({
    href: '/learn/openclaw-and-clawql',
    name: 'OpenClaw walkthrough',
    description: 'openclaw mcp set, HTTP/stdio, and smoke validation.',
    icon: LinkIcon,
  }),
]

export const referenceHubCards: Array<ReferenceCard> = [
  card({
    href: '/concepts',
    name: 'Core concepts',
    description:
      'Architecture, feature tiers, cache vs vault, Ouroboros overview.',
    icon: ShapesIcon,
  }),
  card({
    href: '/reference/protocol',
    name: 'Protocol reference (v2.1)',
    description: 'Uniform envelope, approval flows, HATEOAS, two-phase commit.',
    icon: DocumentIcon,
  }),
  card({
    href: '/reference/plugins',
    name: 'Plugin model & registry',
    description:
      'Extension contract, horizontal plugins, MCP tools per plugin, enable flags.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/plugins',
    name: 'Plugins hub',
    description: 'One doc page per shipped or planned ClawQL plugin.',
    icon: SquaresPlusIcon,
  }),
  card({
    href: '/tools',
    name: 'MCP tool reference',
    description:
      'search, execute, audit, cache, memory, optional tools and env gates.',
    icon: BoltIcon,
  }),
  card({
    href: '/spec-configuration',
    name: 'Configuration reference',
    description:
      'CLAWQL_* env vars, spec loading, provider presets, precedence rules.',
    icon: CogIcon,
  }),
  card({
    href: '/contributing/technical-specification',
    name: 'Contributor technical specification',
    description:
      'Implementation contracts, Effect-TS patterns, CRD fields, CI rules.',
    icon: BookIcon,
  }),
  card({
    href: '/bundled-specs',
    name: 'Bundled API specs',
    description:
      'Provider presets shipped in clawql-mcp and CLAWQL_PROVIDER values.',
    icon: PackageIcon,
  }),
  card({
    href: '/reference/optional-tools',
    name: 'Optional tools hub',
    description:
      'Cache, schedule, notify, Onyx, sandbox — consolidated learn walkthroughs.',
    icon: ClipboardIcon,
  }),
  card({
    href: '/graphql-proxy',
    name: 'GraphQL layer',
    description:
      'Internal OpenAPI→GraphQL projection vs native GraphQL sources.',
    icon: CogIcon,
  }),
  card({
    href: '/nats-jetstream',
    name: 'NATS JetStream',
    description:
      'Optional event backbone for Ouroboros and agent coordination.',
    icon: MapPinIcon,
  }),
  card({
    href: '/benchmarks',
    name: 'Benchmarks',
    description:
      'Planning-context comparisons and reproducible workflow artifacts.',
    icon: ListIcon,
  }),
]

export const resourcesHubCards: Array<ReferenceCard> = [
  card({
    href: '/vision/roadmap',
    name: 'Roadmap',
    description: 'Public edition — what ships today vs what is in development.',
    icon: BookIcon,
  }),
  card({
    href: '/resources/changelog',
    name: 'Changelog & releases',
    description: 'Major versions and links to GitHub release notes.',
    icon: TagIcon,
  }),
  card({
    href: '/troubleshooting',
    name: 'Troubleshooting & FAQ',
    description: 'Common MCP, spec, auth, and deploy failure modes.',
    icon: TagIcon,
  }),
  card({
    href: '/resources/migration',
    name: 'Migration guide',
    description: 'Upgrading ClawQL versions and moving from other MCP servers.',
    icon: DocumentIcon,
  }),
  card({
    href: '/vision/slide-deck',
    name: 'Consolidated slide deck',
    description: '~80 slides — ecosystem overview for presentations.',
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
    href: '/getting-started/local-agent-sandbox',
    name: 'Local agent sandbox (CLI)',
    description:
      'clawql sandbox init — per-harness Seatbelt profiles; fail-closed harness launch.',
    icon: ShapesIcon,
  }),
  card({
    href: '/hitl-label-studio',
    name: 'HITL — Label Studio',
    description: 'Human review queues and webhook callbacks.',
    icon: BellIcon,
  }),
  card({
    href: '/learn/vault-memory-between-chats',
    name: 'Vault memory',
    description: 'Durable memory_ingest / memory_recall across sessions.',
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
    href: '/plugins/documents',
    name: 'Documents & IDP',
    description: 'ingest_external_knowledge, Onyx search, optional IDP tools.',
    icon: DocumentIcon,
  }),
  card({
    href: '/plugins/bundled-providers',
    name: 'Bundled providers',
    description:
      'Default stack: Cloudflare, GitHub, Slack, Linear, Notion, Onyx; all-providers for everything.',
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
