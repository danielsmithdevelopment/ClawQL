import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Custom sources — register MCP servers into one gateway',
  description:
    'ClawQL is an MCP gateway: register other MCP servers (and OpenAPI/GraphQL/gRPC/CLI backends) into one search/execute surface you can permit and lock down with Panguard, ATR, and Seatbelt.',
  path: '/getting-started/custom-sources',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function GettingStartedCustomSourcesPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="claw" variant="medium">
          MCP gateway
        </Tag>
        <Tag color="sky" variant="medium">
          Custom sources
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>One gateway, many MCP servers.</strong> Register upstream MCP
          (and API) sources with{' '}
          <code className="font-mono text-xs">clawql sources add</code>, then
          permit and lock down the single ClawQL surface — Seatbelt, Panguard,
          audit. Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/custom-sources.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/custom-sources.md
          </a>
          . Related:{' '}
          <a
            href="/agent-setup#local-agent-sandbox-mac-os-seatbelt"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Seatbelt sandbox
          </a>
          ,{' '}
          <a
            href="/plugins/sandbox"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Sandbox plugin
          </a>
          ,{' '}
          <a
            href="/mcp-clients"
            className="font-medium text-inherit underline underline-offset-2"
          >
            MCP clients
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/getting-started/custom-sources"
        className="flex-auto"
      />
    </article>
  )
}
