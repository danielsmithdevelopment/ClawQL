import { Button } from '@/components/Button'
import { Heading } from '@/components/Heading'

const guides = [
  {
    href: '/getting-started',
    name: 'Getting started',
    description:
      'Quickstart path, tier chooser, and links to deployment tiers.',
  },
  {
    href: '/architecture',
    name: 'Architecture & vision',
    description:
      '6-layer platform, DAOS, immutable releases, token efficiency.',
  },
  {
    href: '/deployment',
    name: 'Deployment & operations',
    description:
      'Tier 1–3 hub: Compose, Kubernetes, Helm, enterprise observability.',
  },
  {
    href: '/guides',
    name: 'Guides',
    description:
      'Learn modules, security, HITL, verticals, and token economics.',
  },
  {
    href: '/reference',
    name: 'Reference',
    description:
      'Protocol v2.1, MCP tools, configuration, contributor specification.',
  },
  {
    href: '/security/defense-in-depth',
    name: 'Security',
    description:
      'Defense in depth, security curriculum, golden image pipeline.',
  },
  {
    href: '/learn',
    name: 'ClawQL Learn',
    description: 'Hands-on modules: search/execute, vault, sandbox, Ouroboros.',
  },
  {
    href: '/examples',
    name: 'Examples',
    description: 'Workflow walkthroughs and session postmortems.',
  },
]

export function Guides() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="guides">
        Documentation hubs
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
