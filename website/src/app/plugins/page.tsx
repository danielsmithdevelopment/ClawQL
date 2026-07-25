import { Button } from '@/components/Button'
import { Note } from '@/components/mdx'
import { PluginRegistryExplorer } from '@/components/PluginRegistryExplorer'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Plugins',
  description:
    'ClawQL plugin registry: horizontal building blocks and domain verticals — verticals are presets that compose memory, documents, and other plugins with domain-tailored .cqw boilerplate.',
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
          Verticals = presets
        </Tag>
        <Tag color="zinc" variant="medium">
          July 2026
        </Tag>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
        Plugins
      </h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        Horizontal plugins are reusable capabilities. Domain verticals are{' '}
        <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
          presets
        </strong>{' '}
        — packages that compose those capabilities (almost always Memory,
        usually Documents) and ship domain-tailored boilerplate such as{' '}
        <code className="font-mono text-[0.9em]">.cqw</code> workflows ready to
        run or modify.
      </p>

      <div className="not-prose mt-6 mb-8 flex flex-wrap gap-3">
        <Button href="#how-to-read" arrow="right">
          <>How to read the catalog</>
        </Button>
        <Button href="/reference/verticals" variant="outline">
          <>Verticals guide</>
        </Button>
        <Button href="/reference/plugins" variant="outline">
          <>Plugin model</>
        </Button>
      </div>

      <h2
        id="how-to-read"
        className="scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        How to read this catalog
      </h2>
      <div className="mt-4 space-y-3 text-zinc-600 dark:text-zinc-400">
        <p>
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            Horizontal
          </strong>{' '}
          (Memory, Documents, Automation, …) — shared building blocks. Toggle
          them alone for a custom install, or let a vertical pull them in.
        </p>
        <p>
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            Domain vertical
          </strong>{' '}
          (Lending, Legal, Healthcare, …) — industry presets on the same{' '}
          <code className="font-mono text-[0.9em]">Plugin.onRegister</code>{' '}
          model. Each row lists what it <em>composes</em> (horizontal plugins)
          and the domain <em>boilerplate</em> it ships (workflows, starters) —
          not a fork of Memory or Documents.
        </p>
        <p>
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            MCP proxy / providers / core
          </strong>{' '}
          — policy chokepoints, spec merge stacks, and always-on gateway tools.
          Core is listed for completeness; it is not an optional Layer.
        </p>
      </div>

      <div className="not-prose mt-8 mb-10">
        <Note>
          Example: <strong>Lending</strong> and a future real-estate vertical
          both compose <strong>Memory</strong> + <strong>Documents</strong>,
          then differentiate with domain <code>.cqw</code> workflows and tools.
          Filter the registry by <em>Domain verticals</em> to compare presets;
          filter by <em>Horizontal</em> to explore the building blocks those
          presets depend on.
        </Note>
      </div>

      <h2
        id="registry"
        className="scroll-mt-28 text-xl font-semibold text-zinc-900 dark:text-white"
      >
        Plugin registry
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Search and filter by kind, status, composed plugins, tools, or domain
        keywords.
      </p>

      <div className="mt-6">
        <PluginRegistryExplorer />
      </div>
    </article>
  )
}
