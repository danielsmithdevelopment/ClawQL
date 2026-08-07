import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import CelldBody from '@/generated/clawql-celld-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Celld Integration — self-hosted Durable Objects',
  description:
    'How ClawQL Streams runs on celld: Workers/DO API constraints, embedded clawql-core + mcp-api-adapter bundle, LTX WORM trail, fleet deploy, and security hardening.',
  path: '/streams/clawql-celld',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlCelldPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          celld
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Self-hosted DO runtime — not yet shipped.</strong> Companion to{' '}
          <a
            href="/streams/clawql-streams"
            className="font-medium text-inherit underline underline-offset-2"
          >
            ClawQL Streams v0.2
          </a>{' '}
          and the{' '}
          <a
            href="/streams/clawql-durable-objects"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Durable Objects session contract
          </a>
          . Upstream:{' '}
          <a
            href="https://celld.dev/docs/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            celld.dev/docs
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-celld.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-celld.md
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <CelldBody />
      </DocProse>
    </article>
  )
}
