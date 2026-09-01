import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-network — private mesh + governed ephemeral transport',
  description:
    'Headscale persistent mesh, Tailcat ephemeral point-to-point transport, selector safe-by-default routing, and ATR-gated tailcat audit hooks.',
  path: '/specs/network/clawql-network',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlNetworkSpecPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Specs
        </Tag>
        <Tag color="claw" variant="medium">
          Network
        </Tag>
        <Tag color="amber" variant="medium">
          v0.1
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Headscale for standing relationships, Tailcat for genuinely ephemeral links.</strong>{' '}
          The package contribution is the selector (safe-by-default routing) and enforcement (ATR-gated
          tailcat with WORM audit). Operator bootstrap:{' '}
          <code className="text-sm">clawql init --networking</code>. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/specs/network/clawql-network-v0.1.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/specs/network/clawql-network-v0.1.md
          </a>
          . Deployment:{' '}
          <a
            href="/tailscale"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Tailscale / Headscale guide
          </a>
          {' · '}
          <a
            href="/streams/clawql-cellrt"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-cellrt
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/specs/network/clawql-network"
        className="flex-auto"
      />
    </article>
  )
}
