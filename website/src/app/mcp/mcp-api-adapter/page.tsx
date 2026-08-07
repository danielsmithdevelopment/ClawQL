import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import McpApiAdapterBody from '@/generated/mcp-api-adapter-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'mcp-api-adapter — five surfaces, one catalog',
  description:
    'Language-agnostic MCP → APIs adapter: wrap any MCP server (stdio, HTTP, or gRPC) and expose OpenAPI, GraphQL, Streamable HTTP /mcp, gRPC, and a generated CLI from one catalog. Multi-surface alternative to mcpo.',
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
          Shipped
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>MCP → APIs (inverse of ClawQL Core).</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-api-adapter.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/mcp/mcp-api-adapter.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Essay:{' '}
          <a
            href="https://pragmaticvectors.com/posts/mcp-api-adapter-five-surfaces/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Five surfaces, one catalog
          </a>
          . Related:{' '}
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
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <McpApiAdapterBody />
      </DocProse>
    </article>
  )
}
