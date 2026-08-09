import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import StructuredFilterBody from '@/generated/memory-recall-structured-filter-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'memory_recall structured filters — ontology extension',
  description:
    'Why memory_recall gained schema + filters against clawql-ontology: exact predicate enumeration, no semantic near-misses, OpenBench B-7 proof.',
  path: '/specs/memory/memory-recall-structured-filter',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function MemoryRecallStructuredFilterPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Specs
        </Tag>
        <Tag color="claw" variant="medium">
          Memory
        </Tag>
        <Tag color="claw" variant="medium">
          Ontology
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Why we extended memory with clawql-ontology.</strong> Semantic{' '}
          <code className="text-sm">memory_recall</code> finds narrative
          context; typed <code className="text-sm">schema</code> +{' '}
          <code className="text-sm">filters</code> decide exact set membership
          against <code className="text-sm">ontology.db</code>. Narrative proof:{' '}
          <a
            href="https://pragmaticvectors.com/posts/memory-finds-ontology-decides/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Memory Finds. Ontology Decides.
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/specs/memory/memory-recall-structured-filter-v0.1.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/specs/memory/memory-recall-structured-filter-v0.1.md
          </a>
          . Companion:{' '}
          <a
            href="/specs/ontology/legal-domain"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Legal domain ontology
          </a>
          {' · '}
          <a
            href="/architecture/enterprise-ontology"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Enterprise Ontology
          </a>
          {' · '}
          <a
            href="/learn/memory"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Memory
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <StructuredFilterBody />
      </DocProse>
    </article>
  )
}
