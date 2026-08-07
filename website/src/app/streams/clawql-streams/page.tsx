import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import StreamsBody from '@/generated/clawql-streams-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Streams — event-driven autonomous agents',
  description:
    'Specification for ClawQL Streams: event-triggered agent execution with WORM audit, NATS buffering, significance filters, and DO or Kubernetes scale — the self-sovereign alternative to managed agent runtimes.',
  path: '/streams/clawql-streams',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlStreamsPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          Streams
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Planned package — not yet shipped.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-streams.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-streams.md
          </a>
          . Complements{' '}
          <a
            href="/mcp/mcp-api-adapter"
            className="font-medium text-inherit underline underline-offset-2"
          >
            mcp-api-adapter
          </a>{' '}
          (MCP → APIs) and{' '}
          <a
            href="/inference/clawql-inference"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Agentic Gateway
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <StreamsBody />
      </DocProse>
    </article>
  )
}
