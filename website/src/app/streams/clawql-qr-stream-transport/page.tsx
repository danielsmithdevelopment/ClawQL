import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'ClawQL QR Stream Transport — 7th MCP surface',
  description:
    'Optical QR streaming as mcp-api-adapter’s seventh surface and clawql-streams qr source — air-gap MCP, Merkle verification, and election ballot streaming.',
  path: '/streams/clawql-qr-stream-transport',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlQrStreamTransportPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          QR
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>
            Planned 7th mcp-api-adapter surface — not yet shipped.
          </strong>{' '}
          Extends{' '}
          <a
            href="/streams/clawql-tee-airgap-audit"
            className="font-medium text-inherit underline underline-offset-2"
          >
            TEE air-gap audit frames
          </a>{' '}
          into Streams + MCP. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-qr-stream-transport.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-qr-stream-transport.md
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/streams/clawql-qr-stream-transport" className="flex-auto" />
    </article>
  )
}
