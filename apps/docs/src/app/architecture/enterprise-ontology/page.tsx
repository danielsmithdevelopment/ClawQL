import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Enterprise Ontology — open, versioned, kinetic',
  description:
    'ClawQL’s open YAML/OKF enterprise Ontology: typed entities, relationship graph, kinetic @kinetic actions, Git vs R2, and token-efficiency grounding — without Palantir lock-in.',
  path: '/architecture/enterprise-ontology',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function EnterpriseOntologyPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Architecture
        </Tag>
        <Tag color="claw" variant="medium">
          Ontology
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Open enterprise Ontology.</strong> Typed objects for agents
          (entity · graph · kinetic actions), versioned in Git with OKF memory,
          not a proprietary console. Foundation CLI (
          <code className="text-sm">clawql ontology lint</code> /{' '}
          <code className="text-sm">generate</code>) ships; graph, kinetic
          sandbox, and Command Deck builder are phased. Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/enterprise-ontology.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/architecture/enterprise-ontology.md
          </a>
          . Essay:{' '}
          <a
            href="https://pragmaticvectors.com/posts/memory-finds-ontology-decides/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Memory Finds. Ontology Decides.
          </a>{' '}
          (OpenBench B-7 — why typed predicates beat memory alone). Specs:{' '}
          <a
            href="/specs/memory/memory-recall-structured-filter"
            className="font-medium text-inherit underline underline-offset-2"
          >
            memory_recall structured filters
          </a>
          {' · '}
          <a
            href="/specs/ontology/legal-domain"
            className="font-medium text-inherit underline underline-offset-2"
          >
            legal domain
          </a>
          . Related:{' '}
          <a
            href="/architecture/token-efficiency"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Token efficiency
          </a>
          {' · '}
          <a
            href="/architecture/agentic-fabric"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Agentic Fabric
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

      <Prose className="flex-auto">
        <AgentMarkdownDocBody path="/architecture/enterprise-ontology" />
      </Prose>
    </article>
  )
}
