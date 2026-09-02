import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'OKF memory vault serialization (v0.2)',
  description:
    'ClawQL Open Knowledge Format v0.2 frontmatter contract, trust signals, taxonomy, and memory_ingest / recall behavior.',
  path: '/memory/okf',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function OkfMemoryPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Memory
        </Tag>
        <Tag color="claw" variant="medium">
          OKF v0.2
        </Tag>
      </div>
      <div className="not-prose mb-8">
        <Note>
          Upstream spec:{' '}
          <a
            href="https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Open Knowledge Format (OKF) v0.2
          </a>
          . Related:{' '}
          <a
            href="/learn/memory"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-memory
          </a>
          ,{' '}
          <a
            href="/plugins/memory"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Memory plugin
          </a>
          .
        </Note>
      </div>
      <AgentMarkdownDocBody path="/memory/okf" className="flex-auto" />
    </article>
  )
}
