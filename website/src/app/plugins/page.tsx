import { Button } from '@/components/Button'
import { Note } from '@/components/mdx'
import { PluginRegistryExplorer } from '@/components/PluginRegistryExplorer'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Plugins',
  description:
    'ClawQL plugin registry: horizontal packages, MCP proxies, and domain verticals — searchable with kind and status filters, enable flags, and dedicated docs.',
  path: '/plugins',
})

export const dynamic = 'force-static'

export default function PluginsHubPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Plugins
        </Tag>
        <Tag color="amber" variant="medium">
          Includes verticals
        </Tag>
        <Tag color="zinc" variant="medium">
          July 2026
        </Tag>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
        Plugins
      </h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        Everything that extends the gateway is a plugin — horizontal packages
        (memory, documents, automation), MCP proxies, and{' '}
        <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
          domain verticals
        </strong>{' '}
        (lending, legal, healthcare, …). Verticals are domain-scoped plugins on
        the same registration model, not a separate product line.
      </p>

      <div className="not-prose mt-6 mb-8 flex flex-wrap gap-3">
        <Button href="/reference/plugins" arrow="right">
          <>Plugin model (reference)</>
        </Button>
        <Button href="/reference/verticals" variant="outline">
          <>Verticals guide</>
        </Button>
        <Button href="/tools" variant="outline">
          <>MCP tools</>
        </Button>
      </div>

      <div className="not-prose mb-10">
        <Note>
          <strong>Gateway core</strong> (<code>search</code>,{' '}
          <code>execute</code>, <code>audit</code>, <code>cache</code>) is
          always on — listed in the registry for completeness, but not an
          optional Layer. <strong>Domain verticals</strong> share{' '}
          <code>Plugin.onRegister</code> with horizontal packages; filter the
          registry by <em>Domain verticals</em> to browse them.
        </Note>
      </div>

      <h2
        id="registry"
        className="scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        Plugin registry
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Search and filter the living catalog — kind (horizontal vs domain
        vertical vs proxy), status, packages, tools, and enable flags.
      </p>

      <div className="mt-6">
        <PluginRegistryExplorer />
      </div>
    </article>
  )
}
