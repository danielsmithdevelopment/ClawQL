import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Fast Decision routing closeout v0.4',
  description:
    'Live path is GLiNER2.5-Decide (gliner-decide) @ T=0.75 / τ=0.80. v0.4 stock reject remains the historical productionTrusted claim on frozen n=40.',
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
          <strong>Live path is GLiNER2.5-Decide.</strong> Backend / model id{' '}
          <code>gliner-decide</code>, knobs T=0.75 / τ=0.80 after twin collapse
          (v0.6). The v0.4 stock reject arm (T=4, τ=0.70, ≈82% CP LB @ 18/40) is
          the historical <code>productionTrusted</code> claim on frozen n=40 —
          not the current default. Source:{' '}
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
