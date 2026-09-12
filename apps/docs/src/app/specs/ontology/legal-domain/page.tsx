import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Ontology — Legal Domain Spec',
  description:
    'Legal pack entities (Matter, Client, Attorney, Document) that power memory_recall structured filters and OpenBench B-7 enumeration.',
  path: '/specs/ontology/legal-domain',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function OntologyLegalDomainPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Specs
        </Tag>
        <Tag color="claw" variant="medium">
          Ontology
        </Tag>
        <Tag color="amber" variant="medium">
          v0.1 spec
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Legal domain pack for clawql-ontology.</strong> Typed entities
          that seed <code className="text-sm">ontology.db</code> so{' '}
          <code className="text-sm">memory_recall</code> can evaluate exact
          field predicates. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/specs/ontology/legal-domain-v0.1.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/specs/ontology/legal-domain-v0.1.md
          </a>
          . Related:{' '}
          <a
            href="/specs/memory/memory-recall-structured-filter"
            className="font-medium text-inherit underline underline-offset-2"
          >
            memory_recall structured filters
          </a>
          {' · '}
          <a
            href="/architecture/enterprise-ontology"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Enterprise Ontology
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/specs/ontology/legal-domain"
        className="flex-auto"
      />
    </article>
  )
}
