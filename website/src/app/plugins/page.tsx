import { Button } from '@/components/Button'
import { PluginsHubGrid } from '@/components/DocsHubSections'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Plugins',
  description:
    'ClawQL plugins: gateway core, Panguard proxy, memory, documents, bundled providers, automation, sandbox, Ouroboros, and extension roadmap — each with enable flags and dedicated docs.',
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
        <Tag color="zinc" variant="medium">
          July 2026
        </Tag>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
        Plugins
      </h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        ClawQL ships an opinionated default install and optional horizontal
        plugins that register MCP tools via the plugin registry. Each plugin
        below has its own page — enable flags, packages, and links to
        walkthroughs.
      </p>

      <div className="not-prose mt-6 mb-8 flex flex-wrap gap-3">
        <Button href="/plugins/bundled-providers" arrow="right">
          <>Default provider stack</>
        </Button>
        <Button href="/reference/plugins" variant="outline">
          <>Plugin registry (reference)</>
        </Button>
        <Button href="/tools" variant="outline">
          <>MCP tools</>
        </Button>
      </div>

      <div className="not-prose mb-10">
        <Note>
          <strong>Gateway core</strong> (<code>search</code>, <code>execute</code>
          , <code>audit</code>, <code>cache</code>) is always on — not a plugin.{' '}
          <strong>Bundled providers</strong> control which API specs load; they
          are documented here because they define the default install experience
          alongside MCP plugins.
        </Note>
      </div>

      <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
        Available plugins
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Sorted by typical composition order. Status: always-on, default-on,
        opt-in, planned, or roadmap.
      </p>

      <div className="mt-8">
        <PluginsHubGrid />
      </div>
    </article>
  )
}
