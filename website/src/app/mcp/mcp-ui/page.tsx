import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: '/mcp-ui — Swagger UI for MCP',
  description:
    'Shipped 8th mcp-api-adapter surface: HTMX forms auto-scaffolded from MCP inputSchema — embedded, zero-config playground like Swagger at /docs, with ClawQL templates for search and memory.',
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
        <Tag color="sky" variant="medium">
          Shipped
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>8th mcp-api-adapter surface — shipped in-repo.</strong>{' '}
          Auto-scaffolded HTMX playground at{' '}
          <code className="text-sm">/mcp-ui</code> — forms from{' '}
          <code className="text-sm">inputSchema</code>, inline results, no
          separate frontend. Templates cover ClawQL{' '}
          <code className="text-sm">search</code>,{' '}
          <code className="text-sm">memory_*</code>,{' '}
          <code className="text-sm">cache</code>, and{' '}
          <code className="text-sm">audit</code>. Source:{' '}
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

      <div className="not-prose mb-10 overflow-hidden rounded-xl ring-1 ring-zinc-900/10 dark:ring-white/10">
        <img
          src="/images/mcp-ui/clawql-mcp-ui-demo.gif"
          alt="ClawQL /mcp-ui demo: search GitHub operations and recall vault notes inline"
          width={960}
          height={600}
          className="h-auto w-full"
          loading="eager"
          decoding="async"
        />
      </div>

      <AgentMarkdownDocBody path="/mcp/mcp-ui" className="flex-auto" />
    </article>
  )
}
