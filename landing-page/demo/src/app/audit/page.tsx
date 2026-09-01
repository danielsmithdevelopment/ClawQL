import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Audit Trail',
  description:
    'ClawQL append-only audit trail: hash chain integrity, Merkle batch verification, dual-ack replication, and external anchoring.',
  path: '/audit',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Audit Trail"
      subheadline={
        <p>
          Every consequential action ClawQL takes — a tool call, an authentication event, a scope denial, a document
          extraction, a payment, a model inference — is written to an append-only audit trail before that action is
          considered complete. This is not a logging feature added for compliance checkboxes. It&apos;s the mechanism
          that makes every other claim ClawQL makes about an agent&apos;s behavior checkable after the fact, rather than
          merely asserted at the time.
        </p>
      }
    >
      <p>
        <strong>Package:</strong>{' '}
        <Link href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-audit">clawql-audit</Link>{' '}
        ·{' '}
        <Link href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/clawql-audit/README.md">
          README
        </Link>{' '}
        · companion{' '}
        <Link href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-merkle">clawql-merkle</Link>
      </p>
      <p>
        <strong>Related:</strong> <Link href="/auth">Authentication</Link> (auth events dual-write into this trail) ·{' '}
        <Link href="https://docs.clawql.com/learn/audit-tool-and-observability">Audit tool &amp; observability</Link>{' '}
        (in-process MCP <code>audit</code> ring buffer — different surface)
      </p>

      <h2>What gets recorded</h2>
      <p>
        Anything with a consequence gets an entry: which tool was called, with what arguments, by which session, at what
        time, and what happened as a result. This includes actions that don&apos;t involve a model call at all — a
        scheduled job firing, a file write, a credential refresh, a scope enforcement decision blocking a request. If an
        action changed something or was denied, it&apos;s in the trail.
      </p>
      <p>
        Entries carry enough context to answer, after the fact: what was this session authorized to do, what did it
        actually do, and did those match.
      </p>

      <h2>How integrity is guaranteed</h2>
      <p>
        Two distinct mechanisms are used here, deliberately kept separate because they prove two different things.
      </p>
      <p>
        <strong>A hash chain proves the log itself hasn&apos;t been tampered with.</strong> Every entry embeds the hash
        of the entry before it. If any entry is altered, deleted, or reordered after the fact, recomputing the chain from
        any earlier known-good point immediately reveals it. This is what makes the trail append-only in practice, not
        just by policy — modifying history breaks verifiably.
      </p>
      <p>
        <strong>
          A Merkle root, computed periodically over a batch of entries, proves a specific entry belongs to a specific
          batch without needing the whole batch to check it.
        </strong>{' '}
        This is what makes external verification cheap: rather than handing someone your entire log to confirm one entry,
        you hand them the entry and a short proof, and they can confirm it against a root that&apos;s been published
        independently of you.
      </p>
      <p>
        These aren&apos;t the same thing solving the same problem twice. The hash chain protects the log&apos;s internal
        order over time. The Merkle root is what makes a single entry externally checkable without trusting whoever
        operates the log.
      </p>

      <h2>Replication</h2>
      <p>
        An entry is written locally and queued for remote replication in the same operation — not written locally and
        then separately, optionally, sent elsewhere. A background process drains that queue to remote storage. If the
        remote write is delayed, the entry that produced it is already durable locally (with an outbox record); nothing
        is lost, and callers are not failed solely because remote is temporarily down.
      </p>
      <p>
        On restart, the outbox drains and the trail&apos;s current position is loaded from durable storage before
        anything new is accepted. A process that restarted with no memory of where the log left off would risk starting
        a second, conflicting sequence — this is checked for explicitly rather than assumed away.
      </p>

      <h2>External verification</h2>
      <p>
        Because the trail is Merkle-batched, its integrity doesn&apos;t depend on trusting the operator. A batch root can
        be published somewhere outside ClawQL&apos;s own infrastructure — anchored across multiple public chains chosen
        for stability and low cost rather than any single one — so that a specific entry&apos;s existence at a specific
        time is checkable by anyone, using only that entry and a short proof, against a root they didn&apos;t get from
        ClawQL.
      </p>
      <p>
        ClawQL computes and exposes those batch roots as the handoff for that external anchoring. Publishing a root onto
        public chains is an operator / integrator step on top of the trail (not a single hard-wired vendor chain).
      </p>
      <p>
        This matters for exactly the situations where &quot;trust our logs&quot; isn&apos;t good enough: an audit by a
        party that doesn&apos;t want to rely on the vendor&apos;s word, a dispute where both sides need to agree on what
        happened, a regulatory requirement that records be tamper-evident independent of who&apos;s holding them.
      </p>

      <h2>What this enables</h2>
      <p>
        <strong>Incident review.</strong> If an agent did something unexpected, the trail shows exactly what it was
        authorized to do, what it attempted, and where enforcement did or didn&apos;t intervene — not a reconstruction
        from memory or logs that could have been edited after the fact.
      </p>
      <p>
        <strong>Scope enforcement is itself audited.</strong> When a tool call is blocked because it falls outside a
        session&apos;s authorized scope, that denial is recorded with the same rigor as anything that succeeds. A pattern
        of denials against one session or one credential is visible, not silent.
      </p>
      <p>
        <strong>Correlated chains across systems.</strong> Where one action leads to another — an identity assertion
        issued, then exchanged for an access token, then used to call a tool — each step&apos;s entry carries a reference
        to the step before it, so the full sequence can be reconstructed from any point in it, not just inferred from
        timestamps.
      </p>
      <p>
        <strong>Standalone use.</strong> The audit trail has no dependency on the rest of ClawQL&apos;s stack. It can be
        adopted on its own, in front of any agent framework, by a team that wants tamper-evident logging without adopting
        anything else ClawQL does.
      </p>

      <h2>Summary</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>Mechanism</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Log can&apos;t be silently altered</td>
              <td>Hash chain — every entry references the one before it</td>
            </tr>
            <tr>
              <td>One entry verifiable without the whole log</td>
              <td>Merkle batch root + short inclusion proof</td>
            </tr>
            <tr>
              <td>No entry lost between local write and remote copy</td>
              <td>Local write and replication outbox in one operation</td>
            </tr>
            <tr>
              <td>Restart can&apos;t fork the sequence</td>
              <td>Chain position / outbox loaded from durable storage before accepting new entries</td>
            </tr>
            <tr>
              <td>Verifiable without trusting the operator</td>
              <td>Batch roots computed for external anchoring (multi-location publish)</td>
            </tr>
            <tr>
              <td>Works without the rest of ClawQL</td>
              <td>No dependency on other ClawQL components</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DocumentCentered>
  )
}
