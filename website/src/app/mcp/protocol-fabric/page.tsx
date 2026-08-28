import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Protocol Fabric — any protocol ↔ any protocol via MCP',
  description:
    'ClawQL Protocol Fabric: Core + mcp-api-adapter with MCP as the common IR. Proven end-to-end loop — WebSocket → execute CLI source → gen-cli REST → memory_ingest → vault recall.',
  path: '/mcp/protocol-fabric',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ProtocolFabricPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          MCP
        </Tag>
        <Tag color="claw" variant="medium">
          Protocol Fabric
        </Tag>
        <Tag color="sky" variant="medium">
          Shipped
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Any protocol ↔ any protocol via MCP.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/protocol-fabric.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/mcp/protocol-fabric.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Related:{' '}
          <a
            href="/mcp/mcp-api-adapter"
            className="font-medium text-inherit underline underline-offset-2"
          >
            mcp-api-adapter
          </a>
          ,{' '}
          <a
            href="/getting-started/custom-sources"
            className="font-medium text-inherit underline underline-offset-2"
          >
            custom sources
          </a>
          ,{' '}
          <a
            href="/streams/clawql-streams"
            className="font-medium text-inherit underline underline-offset-2"
          >
            ClawQL Streams
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/mcp/protocol-fabric" className="flex-auto" />
    </article>
  )
}
