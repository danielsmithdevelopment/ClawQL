import { Note } from '@/components/mdx'
import { DocProse } from '@/components/DocProse'
import { Tag } from '@/components/Tag'
import HybridDecentralizedBody from '@/generated/clawql-hybrid-decentralized-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Immutable Releases — Hybrid Decentralized GitHub Alternative',
  description:
    'Layer 0: permanent Arweave releases, Radicle + GitHub mirror, IPFS staging, Rift build environments, and the clawql-release CLI with machine-readable policy manifests.',
  path: '/vision/immutable-releases',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ImmutableReleasesPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vision
        </Tag>
        <Tag color="claw" variant="medium">
          Layer 0
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Layer 0 — Immutable Releases.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-hybrid-decentralized-github-alternative.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/vision/clawql-hybrid-decentralized-github-alternative.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. See also{' '}
          <a
            href="/vision/modularization"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Modularization v2.1
          </a>{' '}
          (Layer 0 in the platform stack) and{' '}
          <a
            href="/vision/roadmap"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Vision & Roadmap
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <HybridDecentralizedBody />
      </DocProse>
    </article>
  )
}
