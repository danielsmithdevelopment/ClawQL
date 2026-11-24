import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-governance-page-draft.md`
const MULTI_ATTACK =
  `${GH}/blob/main/docs/benchmarks/security-suite/multi-attack-injection/results-smoke.json`
const OP_RISK = `${GH}/blob/main/docs/specs/risk/operation-risk-from-spec-v0.1.md`
const EGRESS_DELIVERABLES =
  `${GH}/blob/main/docs/security/clawql-security-defense-deliverables.md`

export const metadata = pageMetadata({
  title: 'Governance',
  description:
    'Rules your agents cannot rewrite: ClawQL can govern tool calls outside the agent — classify, check, approve, inject credentials, execute, label, and audit. Panguard ATR fail-closed enforcement is opt-in in self-hosted 8.0.',
  path: '/governance',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Governance"
      subheadline={
        <p>
          Rules your agents can&apos;t rewrite — when enforcement is enabled. Panguard ATR fail-closed is opt-in in
          self-hosted 8.0 (<code>CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>).
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.durability}>/durability</Link>
        {' · '}
        <Link href={site.urls.ontology}>/ontology</Link>
        {' · '}
        <Link href={`${site.urls.benchmarks}#multi-attack`}>/benchmarks</Link>
        {' · '}
        <Link href={site.urls.security}>/security</Link>
        {' · '}
        Source draft: <Link href={DRAFT_DOC}>docs/gtm/clawql-governance-page-draft.md</Link>
      </p>

      <p>
        An agent with real access can be tricked. A web page, an email or a document it reads can carry instructions, and
        a model that follows them can send data somewhere it shouldn&apos;t or take an action no one approved. Telling
        the model, in its prompt, not to do something is not a control: models given a capability and told not to use it
        still use it, with real frequency.
      </p>
      <p>
        ClawQL is designed to govern agents from outside the agent. Tool calls that pass through the gateway can be
        decided by rules the agent cannot see, edit, or argue with — when ATR scoping and Panguard enforcement are
        configured. In self-hosted 8.0, Panguard ATR fail-closed enforcement is opt-in (
        <code>CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>). Managed hosting defaults may differ; state them per deploy. The
        guarantees apply to the enforced path regardless of which model you use or how it was prompted.
      </p>
      <p>Three principles run through everything below:</p>
      <ul>
        <li>
          <strong>Enforce outside the agent.</strong> Rules live where the agent can&apos;t reach them.
        </li>
        <li>
          <strong>Deterministic first.</strong> Decisions come from types, labels and specifications, not from another
          model&apos;s judgment.
        </li>
        <li>
          <strong>When in doubt, ask a person.</strong> Anything the rules don&apos;t cover goes to a human, never to a
          guess.
        </li>
      </ul>

      <h2>One tool call, end to end</h2>
      <p>
        <em>
          Steps 2 to 8 run in the gateway. The agent only ever sees step 1 and the shaped result of step 7.
        </em>
      </p>
      <ol>
        <li>
          <strong>The agent asks.</strong> It names a tool and its arguments. Anything it read earlier in the session may
          have influenced the request, so ClawQL treats the request with the trust of the least-trusted content behind
          it.
        </li>
        <li>
          <strong>Classify.</strong> The call is mapped to an action type from the API&apos;s own specification (OpenAPI,
          Smithy, a contract ABI). Reads and writes are told apart by the spec, never by a model&apos;s guess. A call that
          can&apos;t be classified goes to a person.
        </li>
        <li>
          <strong>Check.</strong> The action type is checked against the session&apos;s mandate (what it is authorized to
          do), the scope a person confirmed, and the labels on the data involved. Rules are written over types, so
          rephrasing a request doesn&apos;t change the answer.
        </li>
        <li>
          <strong>Approve, if required.</strong> Consequential actions wait for a named person. The approval shows what
          the action will actually do, where a preview exists; it can be used once, and it expires.
        </li>
        <li>
          <strong>Inject credentials.</strong> API keys and tokens come from the vault and are attached at the
          gateway&apos;s proxy. The agent never holds them, so it can&apos;t leak them.
        </li>
        <li>
          <strong>Execute.</strong> The intent is recorded durably before the call, and the call carries an idempotency
          key, so a crash can&apos;t cause a repeat (see <Link href={site.urls.durability}>/durability</Link>). Outbound
          traffic can only go where policy allows.
        </li>
        <li>
          <strong>Label and shape.</strong> The result is labeled by origin (anything from outside is untrusted),
          sensitive fields are redacted, and only the fields the agent asked for are returned.
        </li>
        <li>
          <strong>Record.</strong> Decisions, approvals, and results can be written to a hash-chained audit trail that
          reveals later changes. Write-once needs Object Lock (or equivalent). The MCP <code>audit</code> tool is a
          session ring buffer (append/list/clear) — not that trail.
        </li>
      </ol>

      <h2>The controls</h2>

      <h3>Approvals bound to a person</h3>
      <p>
        A consequential action waits for a specific, authenticated person. Each approval covers one action, can be used
        once, and expires. Where the action supports a dry run, the approval shows its predicted effect rather than just
        the agent&apos;s request, and any model-written summary appears beside that effect, labeled. Approval channels
        match the risk: a chat button for low-risk actions, a stronger person-bound signature, such as a passkey, for
        consequential ones.
      </p>
      <p>
        <em>Planned:</em> replaying a proposed policy over recorded traffic to see what it would have blocked before
        enforcing it, and proposing allowlists from what an agent actually did in a trial run, for a person to approve.
      </p>

      <h3>Labels that follow the data</h3>
      <p>
        Everything that enters a session is labeled by where it came from: a person, the agent, a trusted system, or the
        outside world. Labels travel with the data through the session, into memory and through consolidation, and any
        context built from untrusted content is itself untrusted. So an agent that has read a malicious email can&apos;t
        then approve its own consequential action on the strength of that email: the action needs a person.
      </p>

      <h3>Policy over types</h3>
      <p>
        Rules are written against action types and data types (<em>read</em> on <em>documents</em> in{' '}
        <em>project X</em>; <em>delete</em> on anything needs approval), not against strings or command names.
        Classification comes from API specifications, so it can&apos;t be talked around. See{' '}
        <Link href={site.urls.ontology}>/ontology</Link>.
      </p>

      <h3>Credentials the agent never holds</h3>
      <p>
        Keys and tokens live in a vault and are attached by the gateway at the moment of the call. They never enter the
        model&apos;s context, logs or telemetry, so a manipulated agent has nothing to leak. ClawQL Cloud never handles
        consumer-subscription credentials for model providers.
      </p>

      <h3>Default-deny egress</h3>
      <p>
        Outbound traffic is blocked unless policy allows the destination. Every attempt is logged, including blocked ones.
        In ClawQL Cloud, network tunnels are treated as egress paths too, so they can&apos;t be used to route around the
        proxy.
      </p>

      <h3>Redaction and projection</h3>
      <p>
        Sensitive fields (for example protected health information sent toward a model provider without a business
        associate agreement) are redacted before they leave. Results are projected to only the fields the agent asked for,
        which keeps sensitive data out of context and context small.
      </p>

      <h3>A tamper-evident record</h3>
      <p>
        When the durable audit path is enabled, decisions, approvals, denials, and results are written to a hash-chained
        trail: changing, deleting, or reordering any entry breaks the chain, detectably. Write-once needs Object Lock (or
        equivalent). External anchoring of audit roots is design unless a deploy enables it. The MCP{' '}
        <code>audit</code> tool remains a session ring buffer agents can clear — not the examiner trail.
      </p>

      <h2>What we measured</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Test</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Multi-attack suite (smoke): attacks that achieved their goal under ClawQL defaults</td>
              <td>
                <strong>0 of 12</strong> (
                <Link href={MULTI_ATTACK}>results-smoke.json</Link>; scripted worst-case complying agent — measures the
                gateway)
              </td>
            </tr>
            <tr>
              <td>Crash trials: wrong outcomes (repeated or lost actions)</td>
              <td>
                <strong>0 of 1,000</strong> (see <Link href={site.urls.durability}>/durability</Link>)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        AgentDojo attack-success figures are <strong>not</strong> published here: as of 2026-11-11 there is no AgentDojo
        citation or artifact in the public repository. Full tables and raw data for published boards live on{' '}
        <Link href={site.urls.benchmarks}>/benchmarks</Link>. Pass criteria are fixed before a run and never loosened
        after.
      </p>

      <h2>What governance doesn&apos;t do</h2>
      <ul>
        <li>
          <strong>It doesn&apos;t make the model right.</strong> ClawQL controls what an agent may do, not whether its
          answers are correct. A governed agent can still be wrong within its permissions.
        </li>
        <li>
          <strong>It governs what passes through the gateway.</strong> Tool calls routed through ClawQL are covered; a
          container&apos;s internal behavior, or a tool an agent reaches some other way, is not. That is why egress is
          default-deny: it closes the other ways out.
        </li>
        <li>
          <strong>Labels are conservative.</strong> Treating anything external as untrusted means some legitimate actions
          will ask a person. That is the deliberate tradeoff, and policy tools exist to make routine actions pass.
        </li>
        <li>
          <strong>An approval is only as strong as the approver&apos;s account.</strong> That is why consequential
          actions use stronger, person-bound approval channels.
        </li>
      </ul>

      <h2>Works with what you already use</h2>
      <p>
        ClawQL sits underneath the agent, so the agent doesn&apos;t need to change. Any MCP-capable client can route its
        tools through ClawQL today, including Claude Code and other MCP clients. Hermes Agent and Pi as one-click Cloud
        harnesses, a Docker Sandboxes setup guide, and customer Tailscale connectivity are Cloud / network plan items —
        design and docs today, not a published one-click product surface. ClawQL itself never needs to see a model
        provider&apos;s subscription credentials.
      </p>

      <h2>Status</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Control</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Approvals bound to a person, single-use</td>
              <td>
                Built — atomic single-use consume is implemented and tested; approval-integrity board cells still
                scaffold. See <Link href={site.urls.security}>/security</Link> for the defense stack.
              </td>
            </tr>
            <tr>
              <td>Untrusted labels</td>
              <td>Built; measured on the multi-attack smoke (IFC / park)</td>
            </tr>
            <tr>
              <td>Vault credentials injected at the proxy</td>
              <td>Built</td>
            </tr>
            <tr>
              <td>Default-deny egress</td>
              <td>
                Partial — Istio egress allowlist manifests ship for mesh deploys; chart NetworkPolicy and Cloud
                egress-proxy guarantee tests remain planned (
                <Link href={EGRESS_DELIVERABLES}>deliverables</Link>)
              </td>
            </tr>
            <tr>
              <td>Redaction and projection</td>
              <td>Built (Presidio / Stirling in the stack)</td>
            </tr>
            <tr>
              <td>Hash-chained audit with write-once storage</td>
              <td>Built; write-once requires S3 Object Lock configuration</td>
            </tr>
            <tr>
              <td>Panguard ATR fail-closed enforcement</td>
              <td>
                Opt-in in self-hosted 8.0 (<code>CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>). ATR scoping only limits agents
                when configured and enforced.
              </td>
            </tr>
            <tr>
              <td>Preview before approval, risk-tiered approval channels</td>
              <td>Design</td>
            </tr>
            <tr>
              <td>Policy replay and allowlists proposed from trial runs</td>
              <td>Design</td>
            </tr>
            <tr>
              <td>Policy over ontology types</td>
              <td>
                Partial — gateway <Link href={OP_RISK}>operation risk from specs</Link> is built; full ontology ActionType
                policy is design (see <Link href={site.urls.ontology}>/ontology</Link>)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DocumentCentered>
  )
}
