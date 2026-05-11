import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import DefenseInDepthBody from '@/generated/clawql-defense-in-depth-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Defense in depth — MCP & k3s security',
  description:
    'Full ClawQL security architecture: supply chain, IaC, runtime, MCP chokepoints, Vault, Istio, audit — consolidated May 2026 guide (same as docs/security in the repo).',
  path: '/security/defense-in-depth',
  ogType: 'article',
})

/** Full MDX is bundled into this route at build time so HTML includes guide text for crawlers and link previews. */
export const dynamic = 'force-static'

export default function SecurityDefenseInDepthPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="rose" variant="medium">
          Security
        </Tag>
        <Tag color="zinc" variant="medium">
          Defense in depth
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Source:</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code> — edit there, then
          run{' '}
          <code className="font-mono text-xs">
            node scripts/sync-clawql-defense-in-depth-doc.mjs
          </code>{' '}
          from <code className="font-mono text-xs">website/</code> (also runs on{' '}
          <code className="font-mono text-xs">prebuild</code> /{' '}
          <code className="font-mono text-xs">dev</code>
          ). Relative repo links are rewritten to GitHub in the generated file.
          The guide body is included in the{' '}
          <strong>static HTML for this URL at build time</strong> (no
          Suspense/streaming shell) for crawlers and link previews. Summary:{' '}
          <a
            href="/security"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Security overview
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <DefenseInDepthBody />
      </Prose>
    </article>
  )
}
