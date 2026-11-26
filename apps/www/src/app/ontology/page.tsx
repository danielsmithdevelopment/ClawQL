import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const SQL_GOLD = `${GH}/blob/main/benchmarks/harvey-labs/results/ts-v2/sql-gold-001-025.json`
const OP_RISK = `${GH}/blob/main/docs/specs/risk/operation-risk-from-spec-v0.1.md`
const ENTERPRISE_ONTOLOGY = `${GH}/blob/main/docs/architecture/enterprise-ontology.md`
const DOCS_ONTOLOGY = 'https://docs.clawql.com/architecture/enterprise-ontology'

export const metadata = pageMetadata({
  title: 'Ontology',
  description:
    "ClawQL's ontology layer: a typed map of entities, relationships, and actions so agents retrieve exactly, enforce policy over types, and keep context small.",
  path: '/ontology',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Ontology"
      subheadline={
        <p>
          ClawQL&apos;s ontology layer is the typed map of your world that agents work from — entities, relationships,
          and actions on a graph you can version and audit.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        <Link href={site.urls.durability}>/durability</Link>
        {' · '}
        <Link href={site.urls.agents}>/agents</Link>
        {' · '}
        <Link href={DOCS_ONTOLOGY}>docs architecture</Link>
      </p>

      <p>
        Most agent systems give a model a pile of text and a list of tools. ClawQL&apos;s ontology layer gives agents a
        typed model of what exists, how things relate, and what can be done to each. Retrieval, policy, and memory can
        run on that one model — so answers can be exact instead of merely plausible, and rules can hold when a request is
        rephrased.
      </p>

      <h2>What&apos;s in it</h2>
      <ul>
        <li>
          <strong>Entity types</strong> — the kinds of things that exist (customer, contract, matter, document).
        </li>
        <li>
          <strong>Relationship types</strong> — how they connect on the graph (<em>owns</em>, <em>supersedes</em>,{' '}
          <em>belongs to</em>).
        </li>
        <li>
          <strong>Action types</strong> — operations an agent can take, with side effects and governance requirements.
        </li>
        <li>
          <strong>Attributes for policy</strong> — sensitivity, trust, and ownership live on the things themselves.
        </li>
      </ul>

      <h2>Why it matters</h2>
      <p>
        <strong>Exact answers.</strong> Structured predicates over the ontology database return checkable sets — not
        near-misses from semantic search alone. Where there is no type, ClawQL falls back rather than inventing a
        confident wrong answer.
      </p>
      <p>
        <strong>Rules that can&apos;t be talked around.</strong> Policy is written over types, not command strings. See{' '}
        <Link href={site.urls.governance}>/governance</Link>.
      </p>
      <p>
        <strong>Leaner context.</strong> Agents find the operation and facts they need instead of pasting entire
        notebooks.
      </p>

      <h2>Status</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Capability</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Typed structured retrieval</td>
              <td>
                Built; legal SQL-gold set{' '}
                <Link href={SQL_GOLD}>25/25 ground-truth / 30 assertions</Link> without a model in the loop. Agent-level
                remeasure pending.
              </td>
            </tr>
            <tr>
              <td>Policy over action types</td>
              <td>
                Partial — gateway <Link href={OP_RISK}>operation risk from specs</Link> is built; full ActionType policy
                is design.
              </td>
            </tr>
            <tr>
              <td>Standards import, shared multi-org graphs, distributed graph tiers</td>
              <td>Design</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Architecture:{' '}
        <Link href={ENTERPRISE_ONTOLOGY}>
          <code>docs/architecture/enterprise-ontology.md</code>
        </Link>{' '}
        · <Link href={DOCS_ONTOLOGY}>docs.clawql.com</Link>. Schema lives in Git; dynamic instances sync with the vault
        / object storage path documented there.
      </p>
    </DocumentCentered>
  )
}
