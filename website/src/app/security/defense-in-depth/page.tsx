import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'Defense in depth — MCP & k3s security',
  description:
    'ClawQL Defense-in-Depth Security Guide: condensed deployment reference for supply chain, zero-trust, MCP runtime, Panguard, Kata, WORM audit, and GPU protection on self-hosted k3s.',
  path: '/security/defense-in-depth',
  ogType: 'article',
})

/** Full MDX is bundled into this route at build time so HTML includes guide text for crawlers and link previews. */
export const dynamic = 'force-static'

export default function SecurityDefenseInDepthPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="rose" variant="medium">
          Security
        </Tag>
        <Tag color="zinc" variant="medium">
          Defense in depth
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Deployment reference.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/clawql-defense-in-depth-security-guide.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/security/clawql-defense-in-depth-security-guide.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. For reasoning,
          red-team cases, and configuration specifics, see the{' '}
          <a
            href="/security/best-practices"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Security best practices curriculum
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

      <AgentMarkdownDocBody path="/security/defense-in-depth" className="flex-auto" />
    </article>
  )
}
