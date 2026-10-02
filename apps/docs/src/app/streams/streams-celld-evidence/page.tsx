import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Streams + celld evidence matrix',
  description:
    'Commands and CI coverage proving Lab 5b streams-celld behavior: streams-slim, MCP/adapter fetch, bundle gate, Helm templates, and optional celld smoke.',
  path: '/streams/streams-celld-evidence',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function StreamsCelldEvidencePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          celld
        </Tag>
        <Tag color="sky" variant="medium">
          Evidence
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Living checklist</strong> for{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/docs/examples/streams-celld"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/examples/streams-celld
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/streams-celld-evidence.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/streams-celld-evidence.md
          </a>
          . Walkthrough:{' '}
          <a
            href="/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Lab 5b
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/streams/streams-celld-evidence"
        className="flex-auto"
      />
    </article>
  )
}
