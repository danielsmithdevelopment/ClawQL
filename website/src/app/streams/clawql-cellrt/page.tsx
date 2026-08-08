import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import CellrtBody from '@/generated/clawql-cellrt-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-cellrt — ClawQL Cell Runtime',
  description:
    'ClawQL-owned Rust + Wasmtime cell runtime: fleet coordination, LTX WORM, Vault, embedded inference, WASM capability sandbox, and HTTP bootstrap to clawql-mcp.',
  path: '/streams/clawql-cellrt',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlCellrtPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          cellrt
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>ClawQL-owned cell runtime — not yet shipped.</strong>{' '}
          Companion to{' '}
          <a
            href="/streams/clawql-streams"
            className="font-medium text-inherit underline underline-offset-2"
          >
            ClawQL Streams v0.2
          </a>{' '}
          and the{' '}
          <a
            href="/streams/clawql-celld"
            className="font-medium text-inherit underline underline-offset-2"
          >
            celld integration
          </a>{' '}
          (Workers/DO-compatible path). Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-cellrt.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-cellrt.md
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <CellrtBody />
      </DocProse>
    </article>
  )
}
