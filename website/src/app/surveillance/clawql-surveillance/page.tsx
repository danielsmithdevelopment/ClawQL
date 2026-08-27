import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'clawql-surveillance — evidence integrity specification',
  description:
    'Specification for clawql-surveillance: cryptographic chain of custody for surveillance footage — HSE attestation, Merkle/WORM audit, Arweave anchoring, case-number enforcement, and contract compliance reports.',
  path: '/surveillance/clawql-surveillance',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlSurveillancePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vertical
        </Tag>
        <Tag color="claw" variant="medium">
          Surveillance
        </Tag>
        <Tag color="amber" variant="medium">
          Specification
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Planned vertical — not yet shipped.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/surveillance/clawql-surveillance.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/surveillance/clawql-surveillance.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Related:{' '}
          <a
            href="/payments/clawql-payments"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-payments
          </a>{' '}
          (WORM audit pattern),{' '}
          <a
            href="/inference/clawql-inference"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Agentic Gateway
          </a>
          ,{' '}
          <a
            href="/plugins#verticals"
            className="font-medium text-inherit underline underline-offset-2"
          >
            domain verticals
          </a>
          . Marketing:{' '}
          <a
            href="https://clawql.com/industries/surveillance/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Surveillance industry
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/surveillance/clawql-surveillance" className="flex-auto" />
    </article>
  )
}
