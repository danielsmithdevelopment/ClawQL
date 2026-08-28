import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Operator target architecture (planned)',
  description:
    'Design reference for the planned ClawQL Kubernetes Operator, ClawQLInstance CRD, three-tier deployment model, vertical toggles, and natural-language operations — not shipped.',
  path: '/design/operator-target-architecture',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function OperatorTargetArchitecturePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="amber" variant="medium">
          Design · not shipped
        </Tag>
        <Tag color="zinc" variant="medium">
          Operator · CRD
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Design reference only.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/operator-target-architecture.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/design/operator-target-architecture.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Tracking{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/issues/255"
            className="font-medium text-inherit underline underline-offset-2"
          >
            #255
          </a>{' '}
          (Operator) and{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/issues/251"
            className="font-medium text-inherit underline underline-offset-2"
          >
            #251
          </a>{' '}
          (Compose tiers). For runnable installs today, use the{' '}
          <a
            href="/deployment/operations-guide"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Deployment & Operations Guide
          </a>{' '}
          and{' '}
          <a
            href="/helm"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Helm chart
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/design/operator-target-architecture"
        className="flex-auto"
      />
    </article>
  )
}
