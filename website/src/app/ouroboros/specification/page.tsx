import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import DaosSpecificationBody from '@/generated/decentralized-agent-operating-system-spec-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Decentralized Agent Operating System — full specification',
  description:
    'DAOS full specification: NATS JetStream transport layer, two-phase commit gateway, Ouroboros strategic layer (NSV, SGDOP, reputation), and Coordinator integration.',
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
          Specification
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Architecture specification.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ouroboros/decentralized-agent-operating-system-specification.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/ouroboros/decentralized-agent-operating-system-specification.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. For the shipped{' '}
          <code className="font-mono text-xs">clawql-ouroboros</code> library
          and MCP tools, see{' '}
          <a
            href="/ouroboros"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Ouroboros library
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <DaosSpecificationBody />
      </Prose>
    </article>
  )
}
