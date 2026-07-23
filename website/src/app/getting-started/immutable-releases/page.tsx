import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import GettingStartedImmutableReleasesBody from '@/generated/getting-started-immutable-releases-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Immutable releases (clawql-release)',
  description:
    'End-to-end Layer 0 guide: parallel workspaces, signed artifacts, IPFS staging, Lit/x402 access, Arweave permanence, and verify/pull with clawql-release.',
  path: '/getting-started/immutable-releases',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function GettingStartedImmutableReleasesPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Layer 0
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Hands-on pipeline guide.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/immutable-releases.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/immutable-releases.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. For the product
          vision, see{' '}
          <a
            href="/vision/immutable-releases"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Immutable releases
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <GettingStartedImmutableReleasesBody />
      </DocProse>
    </article>
  )
}
