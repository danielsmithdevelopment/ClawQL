import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import VisionRoadmapBody from '@/generated/clawql-vision-roadmap-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Vision & Roadmap',
  description:
    'ClawQL Vision & Roadmap (July 2026): Phase 1 complete in 7.0.0, honest shipped vs planned status, problem space, phased delivery, and how to contribute.',
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
          <strong>Start here.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-vision-roadmap.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/vision/clawql-vision-roadmap.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. For full technical
          depth, see{' '}
          <a
            href="/vision/technical-enablement"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Master enablement
          </a>{' '}
          and{' '}
          <a
            href="/vision/modularization"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Modularization v2.1
          </a>
          ,{' '}
          <a
            href="/vision/immutable-releases"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Immutable releases (Layer 0)
          </a>
          . For implementation contracts, see{' '}
          <a
            href="/contributing/technical-specification"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Contributor Technical Specification
          </a>
          . To run locally, see{' '}
          <a
            href="/deployment/operations-guide"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Deployment & Operations Guide
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <VisionRoadmapBody />
      </DocProse>
    </article>
  )
}
