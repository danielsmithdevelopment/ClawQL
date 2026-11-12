import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const WHITEPAPAPER = `${GH}/blob/main/docs/vision/clawql-network-whitepaper-v0.2.md`
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-ontology-page-draft.md`
const SQL_GOLD = `${GH}/blob/main/benchmarks/harvey-labs/results/ts-v2/sql-gold-001-025.json`
const OP_RISK = `${GH}/blob/main/docs/specs/risk/operation-risk-from-spec-v0.1.md`
const ENTERPRISE_ONTOLOGY = `${GH}/blob/main/docs/architecture/enterprise-ontology.md`

export const metadata = pageMetadata({
  title: 'Ontology',
  description:
    "The typed map of your world that ClawQL agents work from: exact retrieval, policy that can't be talked around, and a clear split between what is built and what is still design.",
  path: '/ontology',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Ontology"
      subheadline={
        <p>
          The typed map of your world that agents work from, and the reason ClawQL can be precise, safe and efficient at
          scale.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.durability}>/durability</Link>
        {' · '}
        <Link href={site.urls.benchmarks}>/benchmarks</Link>
        {' · '}
        <Link href={`${WHITEPAPAPER}#20-clawql-memory-the-vault-and-the-ontology`}>whitepaper §20</Link>
        {' · '}
        Source draft: <Link href={DRAFT_DOC}>docs/gtm/clawql-ontology-page-draft.md</Link>
      </p>

      <p>
        Most agent systems give a model a pile of text and a list of tools and hope it sorts them out. ClawQL gives
        agents a typed model of what exists, how things relate, and what can be done to each. Retrieval, policy, memory
        and routing all run on that one model. That is how ClawQL answers exactly instead of plausibly, and how its rules
        hold even when an agent is tricked into rephrasing a request.
      </p>

      <h2>What&apos;s in it</h2>
      <ul>
        <li>
          <strong>Entity types:</strong> the kinds of things that exist, such as a customer, a contract, a storage
          bucket, a patient record, a token.
        </li>
        <li>
          <strong>Relationship types:</strong> how they connect, such as <em>owns</em>, <em>supersedes</em>,{' '}
          <em>amends</em>, <em>belongs to project</em>.
        </li>
        <li>
          <strong>Action types:</strong> every operation an agent can take, with its inputs, outputs, side effects and
          the governance it requires.
        </li>
        <li>
          <strong>Attributes that drive policy:</strong> sensitivity, trust and ownership live on the things themselves,
          so one rule can cover a whole class of data.
        </li>
        <li>
          <strong>Time and lineage:</strong> facts carry validity windows and links to the evidence they came from, so
          stale facts can be retired and every fact can be traced to its source.
        </li>
      </ul>

      <h2>Why it matters</h2>
      <p>
        <strong>Exact answers, not plausible ones.</strong> Asked &quot;which matters have a springing lien?&quot;, an
        agent doesn&apos;t ask a model to recall or infer the answer from raw text. It runs a structured query against
        typed data and returns an exact, checkable answer, with the documents that support it. Where the ontology has no
        type for something, ClawQL falls back to a general inventory rather than returning a confident wrong answer.
      </p>
      <p>
        <strong>Rules that can&apos;t be talked around.</strong> Policy is written over types, not words: <em>read</em>{' '}
        on <em>documents</em> in <em>project X</em> is allowed; <em>delete</em> on anything needs a person&apos;s
        approval. A rule written against a command string can be dodged by phrasing the same action differently. A rule
        written against an action&apos;s type cannot, because the action is classified before it runs.
      </p>
      <p>
        <strong>Efficiency at scale.</strong> With thousands of tools and large knowledge bases, the ontology lets an
        agent find exactly the operation and the facts it needs, so its context stays small, which keeps it cheaper,
        faster and more accurate.
      </p>

      <h2>How agents use it</h2>
      <ol>
        <li>
          <strong>Context.</strong> Every request draws on three paths at once: keyword search, semantic search, and the
          graph, which follows typed relationships from the entities a question mentions. Results are filtered by
          permissions, trust and validity before ranking, then assembled into context with every item citable.
        </li>
        <li>
          <strong>Policy.</strong> Each tool call is classified into an action type and checked against the ontology: is
          this kind of action allowed, on this kind of thing, within the scope a person confirmed? Anything that
          can&apos;t be classified goes to a person.
        </li>
        <li>
          <strong>Memory.</strong> As agents work, ClawQL consolidates what they learned, mostly into the graph:
          resolving duplicate entities, retiring stale relationships, inferring new ones with their evidence attached.
        </li>
        <li>
          <strong>Routing.</strong> Labels on data decide where it may go, for example which models may see it, before
          any other routing consideration.
        </li>
      </ol>

      <h2>Where the ontology comes from</h2>
      <ul>
        <li>
          <strong>Your existing standards.</strong> Regulated industries already publish ontologies in W3C standards,
          such as FIBO in finance and FHIR&apos;s RDF and ShEx schemas in healthcare. ClawQL imports OWL ontologies and
          SHACL and ShEx shapes, so you can start from your industry&apos;s model instead of a blank page.
        </li>
        <li>
          <strong>Your API specifications.</strong> OpenAPI, Smithy and contract ABIs already describe operations
          precisely. ClawQL derives action types from them deterministically: for example, Smithy&apos;s{' '}
          <code>@readonly</code>, <code>@idempotent</code> and <code>@sensitive</code> traits classify operations and
          data straight from the spec.
        </li>
        <li>
          <strong>Your people.</strong> People author and approve the ontology. Models may propose new types or
          relationships, but changing the vocabulary that policy depends on is always a governed, approved action.
        </li>
      </ul>

      <h2>Safety rules</h2>
      <ul>
        <li>
          <strong>Classification is deterministic.</strong> A model never decides what type an action is; the type comes
          from the specification. Anything unmapped goes to a person.
        </li>
        <li>
          <strong>Every change is validated before it takes effect.</strong> New ontology versions and every
          consolidation run must pass shape validation before they replace what&apos;s live, so a bad change is a
          one-step rollback.
        </li>
        <li>
          <strong>Every version is provable.</strong> Each ontology version&apos;s hash is recorded in ClawQL&apos;s
          tamper-evident audit trail, so you can show which rules governed your data at any point in time.
        </li>
        <li>
          <strong>Trust flows along relationships.</strong> A relationship is only as trusted as its weakest evidence, so
          content from untrusted sources can&apos;t launder its way into trusted context.
        </li>
      </ul>

      <h2>Shared ontologies across organizations</h2>
      <p>
        <em>Design, not yet built.</em>
      </p>
      <p>
        Some knowledge has to be shared by parties that don&apos;t fully trust each other: a supply-chain consortium, a
        group of hospitals. For those, ClawQL orders changes to a shared graph through consensus that tolerates malicious
        participants, so every party&apos;s copy converges and no single member can quietly rewrite shared knowledge.
        Changing a shared ontology requires approval from a set number of member organizations.
      </p>

      <h2>Under the hood</h2>
      <p>
        <em>Design for the tiers below; selection by measured evaluation.</em>
      </p>
      <ul>
        <li>
          <strong>One graph per customer by default.</strong> An embedded graph database per tenant gives hard isolation
          and near-zero idle cost.
        </li>
        <li>
          <strong>A distributed tier for very large customers,</strong> chosen by an evaluation with criteria fixed in
          advance.
        </li>
        <li>
          <strong>One query language, Cypher, across both tiers,</strong> so a customer who outgrows one machine moves by
          migrating data, not by rewriting anything.
        </li>
      </ul>

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
                Built; verified on a legal benchmark set (25 of 25 ground-truth questions;{' '}
                <Link href={SQL_GOLD}>30 SQL-gold assertions</Link> all passed, without a model in the loop). Agent-level
                results pending a fresh measurement.
              </td>
            </tr>
            <tr>
              <td>Policy over action types</td>
              <td>
                Partial — gateway{' '}
                <Link href={OP_RISK}>operation risk from specs</Link> is built (allow / mandate / block). Full ontology
                ActionType policy is design.
              </td>
            </tr>
            <tr>
              <td>Standards import (OWL, SHACL, ShEx)</td>
              <td>Design</td>
            </tr>
            <tr>
              <td>Smithy-derived action types</td>
              <td>Design</td>
            </tr>
            <tr>
              <td>Graph tiers and graph-focused consolidation</td>
              <td>Design</td>
            </tr>
            <tr>
              <td>Shared ontologies across organizations</td>
              <td>Design</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Architecture notes:{' '}
        <Link href={ENTERPRISE_ONTOLOGY}>
          <code>docs/architecture/enterprise-ontology.md</code>
        </Link>
        . Design depth:{' '}
        <Link href={`${WHITEPAPAPER}#20-clawql-memory-the-vault-and-the-ontology`}>whitepaper §20</Link>.
      </p>
    </DocumentCentered>
  )
}
