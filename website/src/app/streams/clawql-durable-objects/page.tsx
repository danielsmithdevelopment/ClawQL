import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'ClawQL Durable Objects — session runtime',
  description:
    'ClawQL Streams Durable Objects session contract: Audit / Inference / TrainingData sidecars, virtual keys, Cloudflare hosted path, celld self-hosted path, and Kubernetes HPA parity.',
  path: '/streams/clawql-durable-objects',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlDurableObjectsPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          Durable Objects
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Planned runtime — not yet shipped.</strong> Companion to{' '}
          <a
            href="/streams/clawql-streams"
            className="font-medium text-inherit underline underline-offset-2"
          >
            ClawQL Streams v0.2
          </a>
          . Self-hosted DO runtime detail:{' '}
          <a
            href="/streams/clawql-celld"
            className="font-medium text-inherit underline underline-offset-2"
          >
            celld integration
          </a>{' '}
          ·{' '}
          <a
            href="/streams/clawql-cellrt"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-cellrt
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-durable-objects.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-durable-objects.md
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/streams/clawql-durable-objects" className="flex-auto" />
    </article>
  )
}
