import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import ContributorTechnicalSpecBody from '@/generated/clawql-contributor-technical-spec-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Contributor Technical Specification',
  description:
    'ClawQL Contributor Technical Specification (May 2026): Plugin contracts, Effect-TS patterns, architecture rules, vertical/provider guides, testing, and CI for contributors.',
  path: '/contributing/technical-specification',
  ogType: 'article',
})

/** Full MDX is bundled into this route at build time for crawlers and link previews. */
export const dynamic = 'force-static'

export default function ContributorTechnicalSpecPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Contributing
        </Tag>
        <Tag color="zinc" variant="medium">
          Contracts
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Implementation contracts.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/contributing/clawql-contributor-technical-specification.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/contributing/clawql-contributor-technical-specification.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Read{' '}
          <a
            href="/vision/roadmap"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Vision & Roadmap
          </a>{' '}
          first for platform context. To run locally first, see{' '}
          <a
            href="/deployment/operations-guide"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Deployment & Operations Guide
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <ContributorTechnicalSpecBody />
      </Prose>
    </article>
  )
}
