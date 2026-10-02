import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Getting started for teams',
  description:
    'Shared ClawQL for teams: R2/S3/GCS vault sync, Packer golden hosts, Prometheus metrics, Loki audit, OTEL traces, and Langfuse.',
  path: '/getting-started/for-teams',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function GettingStartedForTeamsPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Teams
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Team operations guide.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/getting-started-for-teams.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/getting-started-for-teams.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Covers helm
          deploy, team vault sync, golden host seeding, and observability.
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/getting-started/for-teams"
        className="flex-auto"
      />
    </article>
  )
}
