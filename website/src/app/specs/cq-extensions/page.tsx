import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import CqExtensionsIndexBody from '@/generated/cq-extensions-index-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL .cq* file extensions',
  description:
    'Draft Apache 2.0 specs for .cqe (entity), .cqm (manifest), .cqk (knowledge), and .cqw (workflow) — ADR 0010.',
  path: '/specs/cq-extensions',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function CqExtensionsIndexPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Specs
        </Tag>
        <Tag color="claw" variant="medium">
          ADR 0010
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Draft specs.</strong> Open format notes for ClawQL-owned extensions.
          Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/specs/cq-extensions/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/specs/cq-extensions/
          </a>
          . Related:{' '}
          <a
            href="/architecture/enterprise-ontology"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Enterprise Ontology
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <CqExtensionsIndexBody />
      </Prose>
    </article>
  )
}
