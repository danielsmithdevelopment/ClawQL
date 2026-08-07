import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import DurableObjectsBody from '@/generated/clawql-durable-objects-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Durable Objects — session runtime',
  description:
    'Draft implementation spec for ClawQL Streams on Durable Objects: Audit, Inference, and TrainingData sidecars; virtual key bind-on-create / expire-on-destroy; K8s parity.',
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
            ClawQL Streams
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

      <DocProse className="flex-auto">
        <DurableObjectsBody />
      </DocProse>
    </article>
  )
}
