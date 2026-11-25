import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL consolidated slide deck',
  description:
    'Full ~80-slide ClawQL ecosystem deck (§01–§08): MCP, document pipeline, Onyx, memory, Web3/Fabric, security, Helm — same Markdown as docs/presentations/archive/clawql-slides.md.',
  path: '/vision/slide-deck',
  ogType: 'article',
})

/** Deck body loads from ASSETS (agent-markdown.json) so crawlers still get full HTML without bloating Worker JS. */
export const dynamic = 'force-static'

export default function VisionSlideDeckPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vision
        </Tag>
        <Tag color="zinc" variant="medium">
          Slide deck
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Archived (pre-8.0).</strong> This deck is historical and is
          not regenerated on docs prebuild. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/presentations/archive/clawql-slides.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/presentations/archive/clawql-slides.md
          </a>
          . Claims here may not match current defaults (WORM on by default,
          Ouroboros tools opt-in, empty provider catalog). Related case study:{' '}
          <a
            href="/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04"
            className="font-medium text-inherit underline underline-offset-2"
          >
            slide deck vs GitHub parity
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/vision/slide-deck" className="flex-auto" />
    </article>
  )
}
