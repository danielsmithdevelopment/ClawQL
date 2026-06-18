import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import MasterEnablementBody from '@/generated/clawql-master-enablement-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Master enablement — Agent-First Operating System',
  description:
    'ClawQL Master Architecture & Enablement Guide v2.1 (June 2026): 6-layer architecture, Layer 0 immutable releases, gateway, Memory 2.0, Ouroboros, security, LGTMP observability, and documentation suite index.',
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
        <Tag color="claw" variant="medium">
          v2.1 · June 2026
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Master Architecture & Enablement Guide.</strong> Generated
          from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-master-enablement-guide.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/vision/clawql-master-enablement-guide.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code> — edit there, then
          run{' '}
          <code className="font-mono text-xs">
            node scripts/sync-clawql-master-enablement-doc.mjs
          </code>{' '}
          from <code className="font-mono text-xs">website/</code> (also runs on{' '}
          <code className="font-mono text-xs">prebuild</code> /{' '}
          <code className="font-mono text-xs">dev</code>
          ). Start with{' '}
          <a
            href="/vision/roadmap"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Vision & Roadmap
          </a>{' '}
          for shipped vs planned status. Deep dives:{' '}
          <a
            href="/vision/modularization"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Modularization
          </a>
          ,{' '}
          <a
            href="/vision/immutable-releases"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Immutable releases
          </a>
          ,{' '}
          <a
            href="/contributing/technical-specification"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Contributor spec
          </a>
          ,{' '}
          <a
            href="/deployment/operations-guide"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Deployment guide
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
