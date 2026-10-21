import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Session information-flow control (IFC)',
  description:
    'What session IFC is, where it is defined, how and when it is called on native tools and catalog execute, mayFlow rules, env knobs, and what it is not (Panguard, park).',
  path: '/security/session-ifc',
  ogType: 'article',
})

/** Full body synced into agent-markdown.json at build for crawlers and link previews. */
export const dynamic = 'force-static'

export default function SecuritySessionIfcPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="rose" variant="medium">
          Security
        </Tag>
        <Tag color="zinc" variant="medium">
          Session IFC
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Product reference.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/session-information-flow-control.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/security/session-information-flow-control.md
          </a>
          . Design history:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0015-program-mode-alongside-search-execute.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            ADR 0015
          </a>
          . Authz chokepoint (not IFC):{' '}
          <a
            href="/learn/panguard-mcp-enforcement"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Panguard MCP enforcement
          </a>
          . Overview:{' '}
          <a
            href="/security"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Security
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/security/session-ifc"
        className="flex-auto"
      />
    </article>
  )
}
