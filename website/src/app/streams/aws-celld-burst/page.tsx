import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Bursty Streams on AWS — celld, Karpenter, Istio ambient',
  description:
    'Draft spec: celld on AWS under hard-zero burst traffic, Mechanism B vs Karpenter provisioning delay, filler PriorityClasses, Istio ambient as independent security layer, clawql-k8s-operator drift detection — rate-card projections only until §12 measured.',
  path: '/streams/aws-celld-burst',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function AwsCelldBurstPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          AWS
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Unverified until §12 / §13</strong> have ClawQL-measured
          results (three-arm k6 + Cost Explorer). Rate-card arithmetic in §3
          is projection only — not production cost. Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/aws-celld-burst.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/aws-celld-burst.md
          </a>
          . Companion:{' '}
          <a
            href="/streams/clawql-celld"
            className="font-medium text-inherit underline underline-offset-2"
          >
            celld integration
          </a>
          ,{' '}
          <a
            href="/streams/streams-celld-evidence"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Lab 5b evidence
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody src="aws-celld-burst-body.mdx" />
    </article>
  )
}
