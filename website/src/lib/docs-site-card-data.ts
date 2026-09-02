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
import type { ReferenceCard } from '@/components/ReferenceResourceCard'
import { exampleSiteCards } from '@/lib/docs-hub-data'

/** Curated `/learn/*` lessons (matches sidebar “ClawQL Learn” minus Overview). */
export const learnModuleSiteCards: Array<ReferenceCard> = [
  {
    href: '/learn/search-and-execute-mcp',
    name: 'Using search & execute',
    description:
      '`search` / `execute` inputs, args, response fields, and common pitfalls when calling loaded OpenAPI specs.',
    icon: MagnifyingGlassIcon,
    pattern: {
      y: 16,
      squares: [
        [0, 1],
        [1, 3],
      ],
    },
  },
  {
    href: '/learn/external-ingest-knowledge',
    name: 'External ingest & knowledge lake',
    description:
      'Import Markdown or a single URL into the vault with `ingest_external_knowledge`, dry runs, and vault pairing.',
    icon: DocumentIcon,
    pattern: {
      y: 8,
      squares: [
        [0, 2],
        [2, 0],
      ],
    },
  },
  {
    href: '/learn/knowledge-search-onyx',
    name: 'Onyx enterprise search',
    description:
      'Optional `knowledge_search_onyx`: ACL-aware semantic search over your enterprise Onyx index.',
    icon: MagnifyingGlassIcon,
    pattern: {
      y: 4,
      squares: [
        [1, 1],
        [2, 0],
      ],
    },
  },
  {
    href: '/learn/document-pipeline',
    name: 'Document pipeline',
    description:
      'Seven-vendor IDP path: Nextcloud → Tika → Gotenberg → Stirling → archive → Onyx → Coneshare.',
    icon: PackageIcon,
    pattern: {
      y: 20,
      squares: [
        [0, 1],
        [1, 2],
      ],
    },
  },
  {
    href: '/learn/payments-and-entitlements',
    name: 'Payments & entitlements',
    description:
      'Plan tiers, Stripe + x402 gates, WORM payment audit, and inference quota enforcement end-to-end.',
    icon: TagIcon,
    pattern: {
      y: 24,
      squares: [
        [0, 0],
        [1, 1],
      ],
    },
  },
  {
    href: '/learn/sandbox-exec',
    name: 'Sandbox exec',
    description:
      'Optional sandbox_exec MCP tool; pair with Local agent sandbox for full harness containment.',
    icon: ShapesIcon,
    pattern: {
      y: 12,
      squares: [
        [0, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/learn/optional-mcp-tools',
    name: 'Optional MCP tools',
    description:
      'When to enable cache, schedule, notify, audit, Onyx, and sandbox — flags, recipes, and deep-dive links.',
    icon: ListIcon,
    pattern: {
      y: 8,
      squares: [
        [0, 1],
        [1, 0],
      ],
    },
  },
  {
    href: '/learn/effect-ts',
    name: 'Effect-TS in ClawQL',
    description:
      'Why Effect-TS enforces the 7-layer architecture: Layers, Gateway composition, fail-closed errors, and optional plugins.',
    icon: CogIcon,
    pattern: {
      y: 6,
      squares: [
        [0, 0],
        [1, 2],
        [2, 1],
      ],
    },
  },
  {
    href: '/learn/ouroboros-tools',
    name: 'Ouroboros tools',
    description:
      '`ouroboros_*`: seed from documents, evolutionary loop, Postgres lineage, and route hints vs raw infra.',
    icon: SquaresPlusIcon,
    pattern: {
      y: 14,
      squares: [
        [0, 0],
        [2, 1],
      ],
    },
  },
  {
    href: '/learn/streams-getting-started',
    name: 'Streams getting started',
    description:
      'Hands-on labs: schedule, NATS, IDP overlay, agent bridge, celld v0.4.0 — plus DO/celld/cellrt/TEE reading order.',
    icon: BoltIcon,
    pattern: {
      y: 28,
      squares: [
        [0, 1],
        [2, 2],
      ],
    },
  },
  {
    href: '/learn/nats-idp-pipeline',
    name: 'NATS IDP pipeline',
    description:
      'Async document path: inbox webhooks, JetStream workers, KEDA scale, run_idp_pipeline, and agent bridge.',
    icon: PackageIcon,
    pattern: {
      y: 18,
      squares: [
        [0, 2],
        [1, 0],
      ],
    },
  },
  {
    href: '/openclaw',
    name: 'OpenClaw with ClawQL',
    description:
      'Gateway wiring, `openclaw mcp set`, and a smoke path so agents use the same MCP surface as Cursor.',
    icon: LinkIcon,
    pattern: {
      y: 32,
      squares: [
        [0, 2],
        [1, 4],
      ],
    },
  },
  {
    href: '/learn/schedule-notify-workflows',
    name: 'Schedule & notify workflows',
    description:
      '`schedule` synthetics plus `notify` to Slack — threads, HITL hooks, and Label Studio handoff patterns.',
    icon: BellIcon,
    pattern: {
      y: 22,
      squares: [[0, 1]],
    },
  },
  {
    href: '/learn/cache-handoff-between-chats',
    name: 'Cache handoff between chats',
    description:
      'Core `cache` tool: scratch state, TTL, namespacing, and carrying context into a new chat session.',
    icon: ClipboardIcon,
    pattern: {
      y: 10,
      squares: [
        [0, 1],
        [2, 2],
      ],
    },
  },
  {
    href: '/learn/memory',
    name: 'clawql-memory (Memory 2.0)',
    description:
      'Vault ingest/recall, wikilink graph, hybrid vectors, PageIndex, team sync, and the inference flywheel.',
    icon: ChatBubbleIcon,
    pattern: {
      y: 14,
      squares: [
        [0, 1],
        [1, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/learn/audit-tool-and-observability',
    name: 'Audit tool & observability',
    description:
      'Core `audit` ring buffer plus Prometheus, Grafana, and Loki — breadcrumbs without vault writes.',
    icon: ListIcon,
    pattern: {
      y: 18,
      squares: [
        [0, 0],
        [1, 2],
      ],
    },
  },
  {
    href: '/learn/panguard-mcp-enforcement',
    name: 'Panguard MCP enforcement',
    description:
      'JWT ATR chokepoints: stdio wrap, in-process proxy plugin, Helm mcpProxy, and the MCP bridge image.',
    icon: ShapesIcon,
    pattern: {
      y: 26,
      squares: [
        [0, 2],
        [2, 0],
      ],
    },
  },
]

/** Non-`/learn` guides linked from the Learn hub (install, deploy, security, etc.). */
export const learnRelatedGuideSiteCards: Array<ReferenceCard> = [
  {
    href: '/spec-configuration',
    name: 'Spec configuration',
    description:
      'OpenAPI paths, URLs, Google Discovery, merged presets, and CLAWQL_* precedence for loaded specs.',
    icon: CogIcon,
    pattern: {
      y: -6,
      squares: [
        [-1, 2],
        [1, 3],
      ],
    },
  },
  {
    href: '/deployment',
    name: 'Deployment',
    description:
      'Docker, Streamable HTTP, Cloud Run, and links to Kubernetes and remote MCP endpoints.',
    icon: MapPinIcon,
    pattern: {
      y: 12,
      squares: [
        [0, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/tailscale',
    name: 'Tailscale & Headscale',
    description:
      'Private tailnets for MCP: MagicDNS, Serve, CLAWQL_MCP_URL, ACLs, and mesh vs cluster DNS.',
    icon: MapPinIcon,
    pattern: {
      y: 6,
      squares: [
        [1, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/deployment/kubernetes',
    name: 'Kubernetes',
    description:
      'Helm install, gRPC and HTTP, auth, rebuilds, and Kustomize patterns for dev and prod clusters.',
    icon: MapPinIcon,
    pattern: {
      y: 0,
      squares: [
        [0, 1],
        [1, 1],
      ],
    },
  },
  {
    href: '/helm',
    name: 'Helm',
    description:
      'Chart at charts/clawql-mcp: values, GHCR image, optional Ingress, PVC, and upgrade notes.',
    icon: PackageIcon,
    pattern: {
      y: 24,
      squares: [
        [0, 0],
        [2, 1],
      ],
    },
  },
  {
    href: '/docker-desktop-observability',
    name: 'Docker Desktop: Istio & observability',
    description:
      'Prometheus, Grafana, Tempo, Kiali, and OTel Collector on Docker Desktop — beginner-oriented runbooks.',
    icon: BookIcon,
    pattern: {
      y: 2,
      squares: [
        [1, 1],
        [0, 2],
      ],
    },
  },
  {
    href: '/auth',
    name: 'Authentication',
    description:
      'Inbound vs outbound MCP auth — proactive OAuth refresh, API keys, EMA / ID-JAG.',
    icon: ShapesIcon,
    pattern: {
      y: 12,
      squares: [
        [0, 1],
        [1, 0],
      ],
    },
  },
  {
    href: '/audit',
    name: 'Audit Trail',
    description:
      'Append-only WORM trail — hash chain, Merkle batch roots, dual-ack replication.',
    icon: ListIcon,
    pattern: {
      y: 16,
      squares: [
        [0, 0],
        [1, 2],
      ],
    },
  },
  {
    href: '/observability',
    name: 'Observability',
    description:
      'LGTM+ runtime telemetry — Alloy ingest, governed provider registry, Faro JWT proxy.',
    icon: BoltIcon,
    pattern: {
      y: 18,
      squares: [
        [1, 1],
        [0, 2],
      ],
    },
  },
  {
    href: '/security',
    name: 'Security',
    description:
      'Golden image pipeline, Kyverno, Cosign keyless signing, Trivy/OSV gates, and supply-chain references.',
    icon: ShapesIcon,
    pattern: {
      y: 8,
      squares: [
        [0, 2],
        [2, 0],
      ],
    },
  },
  {
    href: '/troubleshooting',
    name: 'Troubleshooting',
    description:
      'Common MCP host failures, spec loading, auth, and where to look first when something breaks.',
    icon: TagIcon,
    pattern: {
      y: 20,
      squares: [
        [0, 1],
        [1, 2],
      ],
    },
  },
]

export const caseStudySiteCards = exampleSiteCards

export { exampleSiteCards }

export const referenceSiteCards: Array<ReferenceCard> = [
  {
    href: '/tools',
    name: 'Tools',
    description:
      'Core search and execute; memory tools, ingest_external_knowledge; optional sandbox_exec (CLAWQL_ENABLE_SANDBOX), cache, audit, schedule, notify, hitl_enqueue_label_studio (CLAWQL_ENABLE_*).',
    icon: BoltIcon,
    pattern: {
      y: 16,
      squares: [
        [0, 1],
        [1, 3],
      ],
    },
  },
  {
    href: '/graphql-proxy',
    name: 'GraphQL proxy',
    description:
      'How in-process GraphQL keeps execute responses lean (single-spec) vs REST (multi-spec).',
    icon: CogIcon,
    pattern: {
      y: -6,
      squares: [
        [-1, 2],
        [1, 3],
      ],
    },
  },
  {
    href: '/deployment/kubernetes',
    name: 'gRPC and Kubernetes',
    description:
      'Optional protobuf MCP over gRPC (port 50051), Streamable HTTP on /mcp, ENABLE_GRPC, Docker Desktop and remote clusters.',
    icon: MapPinIcon,
    pattern: {
      y: 12,
      squares: [
        [0, 0],
        [2, 2],
      ],
    },
  },
  {
    href: '/docker-desktop-observability',
    name: 'Istio & observability',
    description:
      'Docker Desktop: Prometheus, Grafana, Tempo, Kiali, OTel Collector—what each tool is and first steps if you are new to them.',
    icon: BookIcon,
    pattern: {
      y: 8,
      squares: [
        [0, 2],
        [2, 0],
      ],
    },
  },
  {
    href: '/tailscale',
    name: 'Tailscale & Headscale',
    description:
      'Beginner guide: private tailnets for MCP and execute—MagicDNS, Serve, CLAWQL_MCP_URL, Headscale, ACLs, Kubernetes vs mesh DNS.',
    icon: MapPinIcon,
    pattern: {
      y: 4,
      squares: [
        [1, 1],
        [2, 0],
      ],
    },
  },
  {
    href: '/flink-onyx-sync',
    name: 'Flink Onyx sync',
    description:
      'In-cluster Apache Flink runbook for real-time Onyx index freshness: architecture, values.yaml controls, connector secrets isolation, rollout, and troubleshooting.',
    icon: MapPinIcon,
    pattern: {
      y: 20,
      squares: [
        [0, 1],
        [1, 2],
      ],
    },
  },
  {
    href: '/nats-jetstream',
    name: 'NATS JetStream',
    description:
      'Optional event-driven backbone for Ouroboros, agents, and edge sync: Helm values, JetStream retention controls, persistence, and health checks.',
    icon: MapPinIcon,
    pattern: {
      y: 14,
      squares: [
        [0, 0],
        [2, 1],
      ],
    },
  },
  {
    href: '/bundled-specs',
    name: 'Bundled specs',
    description:
      'Provider presets shipped in the package and how CLAWQL_PROVIDER selects them.',
    icon: PackageIcon,
    pattern: {
      y: 32,
      squares: [
        [0, 2],
        [1, 4],
      ],
    },
  },
  {
    href: '/concepts',
    name: 'Concepts',
    description:
      'Architecture, design principles, and how planning vs execution affect context size.',
    icon: ShapesIcon,
    pattern: {
      y: 22,
      squares: [[0, 1]],
    },
  },
  {
    href: '/auth',
    name: 'Authentication',
    description:
      'Inbound vs outbound MCP auth — proactive OAuth refresh, API keys, EMA / ID-JAG.',
    icon: ShapesIcon,
    pattern: {
      y: 6,
      squares: [
        [1, 0],
        [0, 2],
      ],
    },
  },
  {
    href: '/audit',
    name: 'Audit Trail',
    description:
      'Append-only WORM trail — hash chain, Merkle batch roots, dual-ack replication.',
    icon: ListIcon,
    pattern: {
      y: 14,
      squares: [
        [0, 1],
        [2, 0],
      ],
    },
  },
  {
    href: '/observability',
    name: 'Observability',
    description:
      'LGTM+ runtime telemetry — Alloy ingest, governed provider registry, Faro JWT proxy.',
    icon: BoltIcon,
    pattern: {
      y: 16,
      squares: [
        [1, 0],
        [0, 2],
      ],
    },
  },
  {
    href: '/security',
    name: 'Security',
    description:
      'SBOM/provenance attestations, keyless Cosign signing, Trivy and OSV gates, and defense-in-depth deliverables.',
    icon: ShapesIcon,
    pattern: {
      y: 10,
      squares: [
        [0, 1],
        [2, 2],
      ],
    },
  },
  {
    href: '/benchmarks',
    name: 'Benchmarks',
    description:
      'What the benchmark numbers mean and where to find reproducible artifacts in the repo.',
    icon: ListIcon,
    pattern: {
      y: 8,
      squares: [
        [1, 2],
        [2, 0],
      ],
    },
  },
]
