import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import DaosUnifiedBody from '@/generated/daos-unified-architecture-spec-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'DAOS Unified Architecture v2.7',
  description:
    'ClawQL Decentralized Agent Operating System v2.7: 7-layer architecture, Universal Manifest, PEP ActionTypes, Memory 2.0, Ouroboros coordination, Circuit Breaker, and Command Deck.',
  path: '/ouroboros/daos',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function DaosUnifiedArchitecturePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Ouroboros
        </Tag>
        <Tag color="zinc" variant="medium">
          Vision / roadmap
        </Tag>
        <Tag color="claw" variant="medium">
          DAOS v2.7
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Vision &amp; roadmap document.</strong> NSV, SGDOP, model
          fingerprinting, the Coordinator, and related DAOS coordination
          primitives are <strong>not shipped yet</strong>. The shipped{' '}
          <a
            href="/ouroboros"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Ouroboros library
          </a>{' '}
          provides the evolutionary loop only. Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ouroboros/daos-unified-architecture-specification-v2.7.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/ouroboros/daos-unified-architecture-specification-v2.7.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Deep dives:{' '}
          <a
            href="/ouroboros/specification"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Coordination layer
          </a>
          ,{' '}
          <a
            href="/ouroboros/build-plan"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Build plan v2.7.1
          </a>
          ,{' '}
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
        <DaosUnifiedBody />
      </Prose>
    </article>
  )
}
