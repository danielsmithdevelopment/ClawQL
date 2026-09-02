import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Vision & Roadmap',
  description:
    'ClawQL Vision & Roadmap: honest shipped vs planned status through 7.1.0 and 8.0.0 prep — problem space, phased delivery, and how to contribute.',
  path: '/vision/roadmap',
  ogType: 'article',
})

/** Full MDX is bundled into this route at build time for crawlers and link previews. */
export const dynamic = 'force-static'

export default function VisionRoadmapPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vision
        </Tag>
        <Tag color="claw" variant="medium">
          Public edition
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Start here for status.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-vision-roadmap.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/vision/clawql-vision-roadmap.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Platform hub:{' '}
          <a
            href="/architecture"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Architecture
          </a>
          . Layer 0:{' '}
          <a
            href="/vision/immutable-releases"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Immutable releases
          </a>
          . Contracts:{' '}
          <a
            href="/contributing/technical-specification"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Contributor Technical Specification
          </a>
          . Day-2 ops:{' '}
          <a
            href="/deployment/operations-guide"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Operations guide
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/vision/roadmap" className="flex-auto" />
    </article>
  )
}
