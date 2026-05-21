import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import MasterEnablementBody from '@/generated/clawql-master-enablement-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Master enablement — unified technical reference',
  description:
    'ClawQL Master Enablement Document (May 2026): platform status, architecture, deployment tiers, compliance, and phased package roadmap — canonical living reference from docs/vision.',
  path: '/vision/technical-enablement',
  ogType: 'article',
})

/** Full MDX is bundled into this route at build time for crawlers and link previews. */
export const dynamic = 'force-static'

export default function VisionMasterEnablementPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vision
        </Tag>
        <Tag color="amber" variant="medium">
          Living document
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Source:</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-master-enablement-guide.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/vision/clawql-master-enablement-guide.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code> — edit there, then run{' '}
          <code className="font-mono text-xs">
            node scripts/sync-clawql-master-enablement-doc.mjs
          </code>{' '}
          from <code className="font-mono text-xs">website/</code> (also runs on{' '}
          <code className="font-mono text-xs">prebuild</code> /{' '}
          <code className="font-mono text-xs">dev</code>
          ). Companion vision docs:{' '}
          <a
            href="/vision/modularization"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Modularization v2.0
          </a>
          ,{' '}
          <a
            href="/vision/slide-deck"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Slide deck
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <MasterEnablementBody />
      </Prose>
    </article>
  )
}
