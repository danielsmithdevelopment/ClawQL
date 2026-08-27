import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'DAOS Coordination Layer — transport & Ouroboros',
  description:
    'DAOS coordination layer: HTTP + NATS JetStream handoff, NSV and SGDOP diversity metrics, reputation attribution, Diversity Dividends, and Coordinator integration.',
  path: '/ouroboros/specification',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function DaosSpecificationPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Ouroboros
        </Tag>
        <Tag color="zinc" variant="medium">
          Vision / roadmap
        </Tag>
        <Tag color="zinc" variant="medium">
          Coordination
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Vision &amp; roadmap document.</strong> NSV, SGDOP, Diversity
          Dividends, and the Coordinator are <strong>not shipped yet</strong>.
          Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ouroboros/daos-coordination-layer-specification.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/ouroboros/daos-coordination-layer-specification.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Full platform:{' '}
          <a
            href="/ouroboros/daos"
            className="font-medium text-inherit underline underline-offset-2"
          >
            DAOS Unified v2.7
          </a>
          . Shipped library:{' '}
          <a
            href="/ouroboros"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Ouroboros library
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/ouroboros/specification" className="flex-auto" />
    </article>
  )
}
