import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const EVIDENCE_BOARD =
  `${GH}/blob/e7e2d8d11d2a0f81e98002730e3620eacccacb34/docs/benchmarks/program-cell-fleet-kill/phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json`
const EVIDENCE_SOAK =
  `${GH}/blob/e7e2d8d11d2a0f81e98002730e3620eacccacb34/docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini-identity-remeasure.json`
const EVIDENCE_SETTLE =
  `${GH}/blob/de237c7681f87bdbcbef8e9dac0aa813ed8d9148/docs/benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json`
const EVIDENCE_DIR =
  `${GH}/tree/e7e2d8d11d2a0f81e98002730e3620eacccacb34/docs/benchmarks/program-cell-fleet-kill`
const FORMAL_TLA = `${GH}/tree/cadb0a4bcb7dd312663b9eea59ec1e49ff6c6ba6/formal/tla`
const WHITEPAPAPER = `${GH}/blob/main/docs/vision/clawql-network-whitepaper-v0.2.md`
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-durability-page-draft.md`

export const metadata = pageMetadata({
  title: 'Durability',
  description:
    "What happens to an agent's work when a machine crashes mid-action, and how ClawQL proves it: journaled intent, leases that treat silence as not death, and crash boards with zero wrong outcomes in 1,000 trials.",
  path: '/durability',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Durability"
      subheadline={
        <p>
          What happens to an agent&apos;s work when a machine crashes in the middle of an action, and how we prove it.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Full measurement tables:{' '}
        <Link href={`${site.urls.benchmarks}#durability`}>/benchmarks § Durability</Link>
        {' · '}
        Related: <Link href={site.urls.ontology}>/ontology</Link>
        {' · '}
        Source draft:{' '}
        <Link href={DRAFT_DOC}>docs/gtm/clawql-durability-page-draft.md</Link>
      </p>

      <p>
        Agents don&apos;t just answer questions. They send payments, file records, update databases and call APIs that
        change the world. A crash at the wrong moment can make an agent do something twice, or lose track of what it
        already did. ClawQL is built so that neither happens, and this page shows the evidence, including where it is
        still incomplete.
      </p>

      <h2>Two ways a crash goes wrong</h2>
      <ul>
        <li>
          <strong>A repeated action.</strong> The agent sends a payment, crashes before recording that it did, restarts,
          and sends it again.
        </li>
        <li>
          <strong>A lost intent.</strong> The agent decides to act, but the record of that decision disappears in the
          crash, so after recovery nobody knows whether the action happened.
        </li>
      </ul>
      <p>
        Most agent frameworks handle neither at the infrastructure level; they rely on each tool or developer to cope.
        ClawQL handles both underneath every tool call.
      </p>

      <h2>How ClawQL prevents them</h2>
      <ol>
        <li>
          <strong>Record the intent before acting.</strong> Before any external call, the agent&apos;s intent is written
          to a durable journal. If the machine dies a moment later, the intent survives.
        </li>
        <li>
          <strong>Never acknowledge before it&apos;s durable.</strong> Nothing is confirmed until the write behind it is
          safely stored. Acknowledging too early is exactly how intents get lost.
        </li>
        <li>
          <strong>Attach an idempotency key to every external write.</strong> The key is derived from the journaled
          intent, so if a call is retried after a crash, the receiving service recognizes it as the same request and
          performs it once.
        </li>
        <li>
          <strong>One live owner per agent.</strong> Each agent is owned by exactly one process at a time, through a
          lease. A process that falls behind is fenced off, so it cannot act on stale state.
        </li>
        <li>
          <strong>Silence is not death.</strong> A lease running out does not mean its owner is dead; a frozen process
          can wake up. ClawQL only treats an owner as gone when it can prove it (for example, the process no longer
          exists on that host) or when it has fenced the old owner out.
        </li>
        <li>
          <strong>Uncertainty is explicit.</strong> If a crash lands mid-call and ClawQL cannot know whether the call
          took effect, the outcome is recorded as unknown and resolved by checking, never by guessing or blindly
          retrying.
        </li>
      </ol>

      <h2>What we measured</h2>
      <p>
        On ClawQL&apos;s lab build of the <code>celld</code> runtime (version 0.6.3 plus ClawQL&apos;s fixes), on one
        host, against a mock upstream service:
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Measurement</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Soak: repeated node restarts</td>
              <td>1,000 of 1,000 cycles, no failed readiness, no self-fencing</td>
            </tr>
            <tr>
              <td>Crash trials, killed at every phase of an action</td>
              <td>1,000 trials</td>
            </tr>
            <tr>
              <td>Wrong outcomes (repeated or lost actions)</td>
              <td>
                <strong>0</strong>
              </td>
            </tr>
            <tr>
              <td>Crashes during an external call where the intent was visible on recovery</td>
              <td>241 of 243; the other 2 never sent the call, confirmed by their effect records</td>
            </tr>
            <tr>
              <td>Trials that missed the recovery deadline</td>
              <td>18 of 1,000 (1.8%, under our 2% limit)</td>
            </tr>
            <tr>
              <td>Median recovery time</td>
              <td>About 17 seconds</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Zero wrong outcomes in 1,000 trials means the true rate is at most about 0.3%, with 95% confidence. It does not
        mean never, and we say so.
      </p>
      <p>
        The soak and the crash trials are proven, inside their own result files, to have run the same binary, identified
        by commit and SHA-256 hash.
      </p>
      <p>
        <strong>Why recovery takes 17 seconds.</strong> An earlier build recovered in about 7, by treating an
        unresponsive owner as dead once its lease ran out. That was unsafe: a frozen owner can wake up and act. We now
        wait until the old owner is provably gone or fenced out. That makes recovery slower and correct, and we chose
        correct.
      </p>

      <h2>How we test</h2>
      <ul>
        <li>
          <strong>Kill at every phase.</strong> Each trial kills the agent at a chosen point: before recording intent,
          after recording it but before calling, during the call, and after the call but before recording the result.
          Every phase must end with the right outcome.
        </li>
        <li>
          <strong>Hostile timing.</strong> Owners are frozen past their leases, stale owners are revived, and renewals
          are made ambiguous, the conditions under which ownership bugs appear.
        </li>
        <li>
          <strong>Ground truth outside the system.</strong> Every trial keeps an independent record of what the receiving
          service actually did, so results never depend on the system grading itself.
        </li>
        <li>
          <strong>Criteria fixed in advance.</strong> Pass and fail criteria are frozen before a board runs and never
          loosened after seeing results. A run is voided only for a monitored environment fault recorded at the time.
        </li>
        <li>
          <strong>Formal models.</strong> Ownership, leases, resume and approval lifecycles are modeled in TLA+, and the
          model checker is used to find counterexamples before code changes.
        </li>
        <li>
          <strong>Same binary, proven.</strong> Result files record the exact build they ran, so a claim can&apos;t
          quietly mix evidence from different code.
        </li>
      </ul>

      <h2>What went wrong along the way</h2>
      <p>We publish failures alongside passes, because the failures are how the system got here.</p>
      <ul>
        <li>
          <strong>Lost intents.</strong> Early boards found that acknowledging a write before it was durable could lose a
          recorded intent in a crash. The upstream runtime fixed this with an always-on output gate, and ClawQL moved to
          that release.
        </li>
        <li>
          <strong>Expiry treated as death.</strong> A lease running out was once enough to recover an owner&apos;s work,
          even while that owner was frozen rather than dead. The rule is now that expiry is never proof of death.
        </li>
        <li>
          <strong>A grading bug.</strong> Our own test harness once counted a timed-out status check as a lost intent. It
          now records those as unknown, and every reclassification is published side by side with the original.
        </li>
        <li>
          <strong>Earlier boards that failed</strong> (versions 1 to 3) remain published with their results.
        </li>
      </ul>

      <h2>Still open</h2>
      <ul>
        <li>
          <strong>An unexplained result.</strong> An earlier board with very short leases recorded 2 lost intents in 100
          trials. One was later classified as a missed fault injection, based on the journal; the other remains
          unsettled.
        </li>
        <li>
          <strong>Recovery time.</strong> 17 seconds is the honest cost of fencing, and we want it lower without giving
          up correctness.
        </li>
        <li>
          <strong>Scope.</strong> These results are from one host, a lab build and a mock upstream service. Multi-host
          runs, the unmodified upstream runtime and real services are next.
        </li>
        <li>
          <strong>What isn&apos;t covered.</strong> Calls to services that don&apos;t accept idempotency keys can end
          with an unknown outcome that must be checked rather than retried. Containers&apos; own internal state is not
          covered. ClawQL&apos;s own payment flows are not yet covered by these results.
        </li>
      </ul>

      <h2>Beyond one machine</h2>
      <p>
        <em>Design work, not yet built or measured.</em> See the network whitepaper{' '}
        <Link href={`${WHITEPAPAPER}#10-the-decentralized-path-the-provider-network`}>§10</Link>,{' '}
        <Link href={`${WHITEPAPAPER}#11-clawql-cellrt-the-runtime-substrate`}>§11</Link>,{' '}
        <Link href={`${WHITEPAPAPER}#28a-governed-on-chain-actions`}>§28A</Link>.
      </p>
      <ul>
        <li>
          <strong>Faster recovery without guessing.</strong> When a service accepts idempotency keys, any replica could
          safely carry out an agent&apos;s recorded intent, so recovery would no longer wait for a lease to expire. This
          follows leaderless consensus designs such as QuePaxa, and will be modeled formally before it is built.
        </li>
        <li>
          <strong>Agreement among parties who don&apos;t trust each other.</strong> For networks of independently
          operated nodes, consensus that tolerates malicious participants: asynchronous DAG-based protocols that never
          depend on timeouts, and designs that use attested hardware to need fewer replicas.
        </li>
        <li>
          <strong>On-chain actions.</strong> A blockchain transaction&apos;s nonce can land only once, so it serves as a
          natural idempotency key: ClawQL journals the signed transaction before broadcasting and checks the chain before
          ever resending. Finality is tracked explicitly, including chain reorganizations.
        </li>
        <li>
          <strong>An independent witness, optionally.</strong> For customers who want proof that does not depend on
          ClawQL at all, decisions can be committed on-chain, executed through Chainlink&apos;s Runtime Environment with
          consensus and attested enclaves, or proven with zero-knowledge proofs. These are opt-in and never the default.
        </li>
      </ul>

      <h2>Check it yourself</h2>
      <p>Everything above is reproducible from the public repository:</p>
      <ul>
        <li>
          Crash boards and evidence:{' '}
          <Link href={EVIDENCE_DIR}>
            <code>docs/benchmarks/program-cell-fleet-kill/</code>
          </Link>
        </li>
        <li>
          Authorizing soak and the v4 board, with matching binary identity:{' '}
          <Link href={EVIDENCE_SOAK}>soak remesure</Link>
          {' · '}
          <Link href={EVIDENCE_BOARD}>board remesure</Link>
          {' · '}
          branch{' '}
          <Link href={`${GH}/tree/v4-soak-mac-mini-20261106`}>
            <code>v4-soak-mac-mini-20261106</code>
          </Link>
        </li>
        <li>
          During-call settlement of the 2 trials:{' '}
          <Link href={EVIDENCE_SETTLE}>
            <code>v4-identity-remeasure-during-call-settle.json</code>
          </Link>
        </li>
        <li>
          Formal models:{' '}
          <Link href={FORMAL_TLA}>
            <code>formal/tla/</code>
          </Link>{' '}
          (program resume, leases, mandates, payments)
        </li>
      </ul>
    </DocumentCentered>
  )
}
