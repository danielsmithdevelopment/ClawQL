import { Button } from '@/components/Button'
import { Heading } from '@/components/Heading'

const guides = [
  {
    href: '/install',
    name: 'Install',
    description:
      'Install clawql-mcp, understand package size and binaries, and run with npx or from source.',
  },
  {
    href: '/mcp-clients',
    name: 'MCP clients',
    description:
      'Wire Cursor, Claude Desktop, or HTTP hosts with stdio, spec env, vault, and sandbox bridge.',
  },
  {
    href: '/spec-configuration',
    name: 'Spec configuration',
    description:
      'OpenAPI paths, URLs, Google Discovery, merged presets, and CLAWQL_* precedence.',
  },
  {
    href: '/deployment',
    name: 'Deployment',
    description:
      'Docker, Streamable HTTP, Cloud Run, and links to Kubernetes and remote deploy.',
  },
  {
    href: '/security',
    name: 'Security',
    description:
      'Golden image pipeline end-to-end, Kyverno admission by default, Cosign keyless, Trivy/OSV gates, and defense-in-depth references.',
  },
  {
    href: '/kubernetes',
    name: 'Kubernetes',
    description:
      'Docker Desktop via Helm (localhost:8080/mcp), auth, rebuilds, and Kustomize dev/prod deploy.',
  },
  {
    href: '/docker-desktop-observability',
    name: 'Istio & observability',
    description:
      'Prometheus, Grafana, Jaeger, Kiali, OTel Collector with optional Istio on Docker Desktop—beginner getting-started for each tool.',
  },
  {
    href: '/helm',
    name: 'Helm',
    description:
      'Helm chart at charts/clawql-mcp: install, values, GHCR image, optional Ingress and PVC.',
  },
  {
    href: '/notify',
    name: 'Slack notify',
    description:
      'Optional notify tool (CLAWQL_ENABLE_NOTIFY): chat.postMessage, tokens, channels, and JSON examples.',
  },
  {
    href: '/hitl-label-studio',
    name: 'HITL — Label Studio',
    description:
      'Optional hitl_enqueue_label_studio (CLAWQL_ENABLE_HITL_LABEL_STUDIO): Label Studio import API, webhook to memory_ingest or audit, Helm and OpenClaw notes.',
  },
  {
    href: '/onyx-knowledge',
    name: 'Onyx knowledge search',
    description:
      'Optional knowledge_search_onyx (CLAWQL_ENABLE_ONYX): ONYX_BASE_URL, tokens, semantic search examples, vault pairing.',
  },
]

export function Guides() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="guides">
        Guides
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/5">
        {guides.map((guide) => (
          <div key={guide.href}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {guide.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.description}
            </p>
            <p className="mt-4">
              <Button href={guide.href} variant="text" arrow="right">
                Read more
              </Button>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
