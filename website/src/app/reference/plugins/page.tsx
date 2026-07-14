import { Button } from '@/components/Button'
import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import ClawQLPluginModelBody from '@/generated/clawql-plugin-model-body.mdx'
import ClawQLPluginRegistryBody from '@/generated/clawql-plugin-registry-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Plugin model & registry',
  description:
    'ClawQL plugin registry and model (June 2026): shipped Panguard proxy plugin, horizontal packages becoming plugins (memory, documents, automation), MCP tool ownership, and third-party extension path.',
  path: '/reference/plugins',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function PluginsReferencePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Reference
        </Tag>
        <Tag color="amber" variant="medium">
          Partially shipped
        </Tag>
        <Tag color="zinc" variant="medium">
          June 2026
        </Tag>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
        Plugin model &amp; registry
      </h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        How ClawQL packages become plugins, which MCP tools each plugin owns,
        and the living registry of shipped vs planned extensions.
      </p>

      <div className="not-prose mt-6 mb-8 flex flex-wrap gap-3">
        <Button href="/plugins" arrow="right">
          <>Plugins hub</>
        </Button>
        <Button href="/tools" variant="outline">
          <>MCP tools</>
        </Button>
        <Button href="/vision/modularization" variant="outline">
          <>Modularization v2.1</>
        </Button>
        <Button href="/contributing/technical-specification" variant="outline">
          <>Contributor spec</>
        </Button>
      </div>

      <div className="not-prose mb-8">
        <Note>
          Synced from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/reference/clawql-plugin-registry.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/reference/clawql-plugin-registry.md
          </a>{' '}
          and{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/clawql-plugin-model.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/design/clawql-plugin-model.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code> via{' '}
          <code className="font-mono text-xs">
            node scripts/sync-clawql-plugin-docs.mjs
          </code>{' '}
          (<code className="font-mono text-xs">prebuild</code> /{' '}
          <code className="font-mono text-xs">dev</code>). Package extraction
          ground truth:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/modularization-implementation-status.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            modularization implementation status
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <div id="plugin-registry">
          <ClawQLPluginRegistryBody />
        </div>
        <hr className="my-12 border-zinc-200 dark:border-zinc-800" />
        <div id="plugin-model">
          <ClawQLPluginModelBody />
        </div>
      </DocProse>
    </article>
  )
}
