import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-government — outcome accountability specification',
  description:
    'Government vertical: measurable outcome definitions, Arweave-anchored baselines, Merkle/WORM audit, FOIA vault, bond validation, and nonprofit contractor accountability.',
  path: '/government/clawql-government',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlGovernmentPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vertical
        </Tag>
        <Tag color="claw" variant="medium">
          Government
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Planned package — not yet shipped.</strong> Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/government/clawql-government.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/government/clawql-government.md
          </a>
          . Industry page:{' '}
          <a
            href="https://clawql.com/industries/government/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql.com/industries/government
          </a>
          . Air-gap auditor export via{' '}
          <a
            href="/streams/clawql-qr-stream-transport"
            className="font-medium text-inherit underline underline-offset-2"
          >
            QR stream transport
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/government/clawql-government"
        className="flex-auto"
      />
    </article>
  )
}
