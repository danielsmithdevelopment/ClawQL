import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'Deployment & Operations Guide',
  description:
    'ClawQL operations for shipped Helm installs: quick start, health checks, secrets, upgrades, and links to the seven-vendor IDP pipeline.',
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
        <Tag color="sky" variant="medium">
          Helm · shipped
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
          on <code className="font-mono text-xs">main</code>. Planned Operator /
          CRD content lives in the{' '}
          <a
            href="/design/operator-target-architecture"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Operator target architecture
          </a>
          . See{' '}
          <a
            href="/vision/roadmap"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Vision & Roadmap
          </a>{' '}
          for shipped vs planned status.
        </Note>
      </div>

      <AgentMarkdownDocBody path="/deployment/operations-guide" className="flex-auto" />
    </article>
  )
}
