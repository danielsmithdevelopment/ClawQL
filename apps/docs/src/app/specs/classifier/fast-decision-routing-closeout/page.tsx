import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Fast Decision routing closeout v0.4',
  description:
    'Stock GLiNER 2.5 reject rule is productionTrusted on frozen n=40 routing; Decide measured on the same slice, not live. Four-arm GHA 36165019073.',
  path: '/specs/classifier/fast-decision-routing-closeout',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function FastDecisionRoutingCloseoutPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Specs
        </Tag>
        <Tag color="claw" variant="medium">
          Classifier
        </Tag>
        <Tag color="amber" variant="medium">
          v0.4 closeout
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>CPU-first on-ramp, not the full router.</strong> Production
          stays on stock GLiNER 2.5 (T=4, τ=0.70): 18/40 fires, 0 errors, ≈82%
          CP lower bound. Decide is measured on the same frozen 40 — forced
          exact-match 92.5%, reject arm 85% fire with 1 error — and is the next
          candidate, not the live path. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/specs/classifier/fast-decision-routing-closeout-v0.4.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/specs/classifier/fast-decision-routing-closeout-v0.4.md
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/specs/classifier/fast-decision-routing-closeout"
        className="flex-auto"
      />
    </article>
  )
}
