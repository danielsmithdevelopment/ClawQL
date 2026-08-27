import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'DAOS Build Plan v2.7.1',
  description:
    'DAOS P0–P3 implementation contract: Manifest validator, PEP state machine, Coordinator Watchdog, Circuit Breaker, Memory 2.0 pruning, Diversity Dividends, and Command Deck Action Views.',
  path: '/ouroboros/build-plan',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function DaosBuildPlanPage() {
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
          Build plan
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Vision &amp; roadmap engineering contract.</strong> P0–P3
          items including NSV, SGDOP, and model fingerprinting are{' '}
          <strong>not shipped yet</strong>. Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ouroboros/daos-build-plan-v2.7.1.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/ouroboros/daos-build-plan-v2.7.1.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Architecture:{' '}
          <a
            href="/ouroboros/daos"
            className="font-medium text-inherit underline underline-offset-2"
          >
            DAOS Unified v2.7
          </a>
          . Ground truth status:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/modularization-implementation-status.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            modularization implementation status
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/ouroboros/build-plan" className="flex-auto" />
    </article>
  )
}
