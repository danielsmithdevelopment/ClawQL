import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import TokenEfficiencyBody from '@/generated/clawql-token-efficiency-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Token efficiency — twelve layers',
  description:
    'Twelve compounding efficiency layers: Code Mode, response trimming, terse output, cache control, semantic cache, history distillation, prompt compression, PAL routing, structured outputs, token budgets, prefill, and the fine-tuning flywheel (~99.8% and compounding).',
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
          <strong>Twelve optimization layers</strong> in three tiers (structural
          → smart inference → continuous/flywheel). Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/clawql-token-efficiency.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/architecture/clawql-token-efficiency.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Hands-on MCP
          usage:{' '}
          <a
            href="/learn/search-and-execute-mcp"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Using search &amp; execute
          </a>
          . Inference stack:{' '}
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
