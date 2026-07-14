import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import TokenEfficiencyBody from '@/generated/clawql-token-efficiency-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Token efficiency — layered approach',
  description:
    'How ClawQL reduces token usage: Code Mode (search/execute), response trimming, prose compression, prompt caching, semantic cache, history compression, and model routing.',
  path: '/architecture/token-efficiency',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function TokenEfficiencyPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Architecture
        </Tag>
        <Tag color="claw" variant="medium">
          Token efficiency
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Eight optimization layers.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/clawql-token-efficiency.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/architecture/clawql-token-efficiency.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Hands-on MCP
          usage:{' '}
          <a
            href="/learn/search-and-execute-mcp"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Using search &amp; execute
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <TokenEfficiencyBody />
      </DocProse>
    </article>
  )
}
