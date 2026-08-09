import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import McpApiAdapterBody from '@/generated/mcp-api-adapter-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'mcp-api-adapter — six surfaces, one catalog',
  description:
    'Language-agnostic MCP → APIs adapter: wrap any MCP server (stdio, HTTP, or gRPC) and expose OpenAPI, GraphQL, Streamable HTTP /mcp, gRPC, WebSocket, and a generated CLI from one catalog. In-repo at 0.6.0; npm publish pending. Multi-surface alternative to mcpo.',
  path: '/mcp/mcp-api-adapter',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function McpApiAdapterPage() {
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
          In-repo
        </Tag>
        <Tag color="amber" variant="medium">
          npm pending
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>MCP → APIs (inverse of ClawQL Core).</strong>{' '}
          <code className="font-mono text-xs">mcp-api-adapter@0.5.1</code> is
          shipped in the monorepo but <strong>not on npm yet</strong> — use the
          from-source quick start until{' '}
          <code className="font-mono text-xs">npm view mcp-api-adapter</code>{' '}
          succeeds. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-api-adapter.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/mcp/mcp-api-adapter.md
          </a>
          . Essay:{' '}
          <a
            href="https://pragmaticvectors.com/posts/mcp-api-adapter-five-surfaces/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Seven surfaces, one catalog
          </a>
          . Related:{' '}
          <a
            href="/mcp/protocol-fabric"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Protocol Fabric
          </a>
          ,{' '}
          <a
            href="/tools"
            className="font-medium text-inherit underline underline-offset-2"
          >
            MCP tools
          </a>
          ,{' '}
          <a
            href="/graphql-proxy"
            className="font-medium text-inherit underline underline-offset-2"
          >
            GraphQL layer
          </a>
          ,{' '}
          <a
            href="/getting-started/custom-sources"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Custom sources
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <McpApiAdapterBody />
      </DocProse>
    </article>
  )
}
