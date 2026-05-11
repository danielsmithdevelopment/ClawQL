import { Suspense, type ReactNode } from 'react'

import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL consolidated slide deck',
  description:
    'Full ~80-slide ClawQL ecosystem deck (§01–§08): MCP, document pipeline, Onyx, memory, Web3/Fabric, security, Helm — same Markdown as docs/presentations/clawql-slides.md.',
  path: '/vision/slide-deck',
  ogType: 'article',
})

/** Route-level code split: this module is not pulled into other pages’ bundles. */
export const dynamic = 'force-static'

async function SlidesMdx(): Promise<ReactNode> {
  const { default: Body } = await import('@/generated/clawql-slides-body.mdx')
  return <Body />
}

function SlideDeckLoading() {
  return (
    <div
      className="mx-auto max-w-2xl py-16 text-sm text-zinc-500 lg:max-w-5xl dark:text-zinc-400"
      role="status"
    >
      Loading slide deck…
    </div>
  )
}

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
          <strong>Source:</strong> This page is generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/presentations/clawql-slides.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/presentations/clawql-slides.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code> — edit there, then
          run{' '}
          <code className="font-mono text-xs">
            node scripts/sync-clawql-slides-doc.mjs
          </code>{' '}
          from <code className="font-mono text-xs">website/</code> (also runs on{' '}
          <code className="font-mono text-xs">prebuild</code> /{' '}
          <code className="font-mono text-xs">dev</code>). The deck body is
          loaded as a <strong>separate async chunk</strong> so other routes do
          not include this file in their graph. Related case study:{' '}
          <a
            href="/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04"
            className="font-medium text-inherit underline underline-offset-2"
          >
            slide deck vs GitHub parity
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <Suspense fallback={<SlideDeckLoading />}>
          <SlidesMdx />
        </Suspense>
      </Prose>
    </article>
  )
}
