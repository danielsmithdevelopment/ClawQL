import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import GettingStartedForTeamsBody from '@/generated/getting-started-for-teams-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Getting started for teams',
  description:
    'Deploy shared ClawQL MCP for your team: object-storage sync for Memory notes, Prometheus metrics, Loki audit, OTEL traces, and Langfuse work traces.',
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
          on <code className="font-mono text-xs">main</code>. Deep dive on sync
          providers:{' '}
          <a
            href="/getting-started/team-vault-sync"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Team vault sync
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <GettingStartedForTeamsBody />
      </Prose>
    </article>
  )
}
