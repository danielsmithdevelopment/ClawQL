import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Migrating to ClawQL 8.0.0',
  description:
    'Breaking changes for clawql-mcp 8.0: empty catalog default, ProviderPlugin rewrite, enforcement opt-in, skills-over-MCP, and migration one-liners from 7.x.',
  path: '/getting-started/migrate-to-8.0',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function MigrateTo8Page() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="amber" variant="medium">
          8.0 breaking
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Major semver — read before upgrading.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/migrate-to-8.0.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/migrate-to-8.0.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Status matrix:{' '}
          <a
            href="/vision/roadmap"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Vision &amp; roadmap
          </a>
          . Release checklist:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/release/v8.0.0-checklist.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            v8.0.0 checklist
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/getting-started/migrate-to-8.0"
        className="flex-auto"
      />
    </article>
  )
}
