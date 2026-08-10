import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import McpUiBody from '@/generated/mcp-ui-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: '/mcp-ui — Swagger UI for MCP',
  description:
    'Planned 8th mcp-api-adapter surface: HTMX forms auto-scaffolded from MCP inputSchema — embedded, zero-config playground like Swagger at /docs.',
  path: '/mcp/mcp-ui',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function McpUiPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          MCP
        </Tag>
        <Tag color="claw" variant="medium">
          Adapter
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Planned 8th mcp-api-adapter surface.</strong> Auto-scaffolded
          HTMX playground at <code className="text-sm">/mcp-ui</code> — forms
          from <code className="text-sm">inputSchema</code>, inline results, no
          separate frontend. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-ui.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/mcp/mcp-ui.md
          </a>
          . Related:{' '}
          <a
            href="/mcp/mcp-api-adapter"
            className="font-medium text-inherit underline underline-offset-2"
          >
            mcp-api-adapter
          </a>
          {' · '}
          <a
            href="/mcp/protocol-fabric"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Protocol Fabric
          </a>
          {' · '}
          <a
            href="/streams/clawql-qr-stream-transport"
            className="font-medium text-inherit underline underline-offset-2"
          >
            QR stream (7th)
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <McpUiBody />
      </DocProse>
    </article>
  )
}
