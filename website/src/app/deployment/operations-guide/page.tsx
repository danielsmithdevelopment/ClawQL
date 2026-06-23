import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import DeploymentOperationsGuideBody from '@/generated/clawql-deployment-operations-guide-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Deployment & Operations Guide',
  description:
    'ClawQL Deployment & Operations Guide (May 2026): Tier 1 Docker Compose, configuration, Presidio, troubleshooting, and tier selection for operators.',
  path: '/deployment/operations-guide',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function DeploymentOperationsGuidePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Deployment
        </Tag>
        <Tag color="amber" variant="medium">
          Tier 1 available
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Operations reference.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-deployment-operations-guide.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/deployment/clawql-deployment-operations-guide.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Tier 2/3 and
          Operator sections document intended procedures — see availability
          table in the guide. See also{' '}
          <a
            href="/vision/roadmap"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Vision & Roadmap
          </a>{' '}
          for shipped vs planned status.
        </Note>
      </div>

      <Prose className="flex-auto">
        <DeploymentOperationsGuideBody />
      </Prose>
    </article>
  )
}
