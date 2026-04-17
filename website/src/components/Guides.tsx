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
    href: '/kubernetes',
    name: 'Kubernetes',
    description:
      'Local MCP on Docker Desktop K8s (localhost:8080/mcp), auth, rebuilds, and remote overlays.',
  },
  {
    href: '/helm',
    name: 'Helm',
    description:
      'Helm chart at charts/clawql-mcp: install, values, GHCR image, optional Ingress and PVC.',
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
