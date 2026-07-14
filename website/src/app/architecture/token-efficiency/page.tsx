import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import TokenEfficiencyBody from '@/generated/clawql-token-efficiency-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Token efficiency — twelve layers',
  description:
    'Why context bloat hurts accuracy (Lost in the Middle, length-alone degradation) and how twelve compounding layers cut cost ~99.8% while improving reasoning.',
  path: '/architecture/token-efficiency',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function TokenEfficiencyPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Architecture
        </Tag>
        <Tag color="claw" variant="medium">
          Token efficiency
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Performance and cost.</strong> Context bloat is a reasoning
          failure mode (Lost in the Middle, length-alone degradation), not only
          a bill. Twelve optimization layers in three tiers (structural → smart
          inference → continuous/flywheel). Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/clawql-token-efficiency.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/architecture/clawql-token-efficiency.md
          </a>
          . Hands-on MCP:{' '}
          <a
            href="/learn/search-and-execute-mcp"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Using search &amp; execute
          </a>
          . Inference:{' '}
          <a
            href="/inference/clawql-inference"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-inference
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <TokenEfficiencyBody />
      </Prose>
    </article>
  )
}
