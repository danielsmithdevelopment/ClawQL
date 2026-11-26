import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const MULTI_ATTACK = `${GH}/blob/main/docs/benchmarks/security-suite/multi-attack-injection/results-smoke.json`
const OP_RISK = `${GH}/blob/main/docs/specs/risk/operation-risk-from-spec-v0.1.md`
const SECURE_DEFAULTS = `${GH}/blob/main/docs/security/secure-defaults.md`

export const metadata = pageMetadata({
  title: 'Governance',
  description:
    'Rules your agents cannot rewrite: ClawQL can govern tool calls outside the agent — classify, check, approve, inject credentials, execute, label, and audit. Panguard ATR fail-closed enforcement is opt-in in self-hosted 8.0; forced under the regulated profile.',
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
          self-hosted 8.0 (<code>CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>) and forced under{' '}
          <code>CLAWQL_TIER=regulated</code>.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.durability}>/durability</Link>
        {' · '}
        <Link href={site.urls.ontology}>/ontology</Link>
        {' · '}
        <Link href={site.urls.dataHandling}>/data-handling</Link>
        {' · '}
        <Link href={`${site.urls.benchmarks}#multi-attack`}>/benchmarks</Link>
        {' · '}
        <Link href={site.urls.security}>/security</Link>
        {' · '}
        <Link href={SECURE_DEFAULTS}>secure defaults</Link>
      </p>

      <p>
        An agent with real access can be tricked. A web page, an email, or a document it reads can carry instructions,
        and a model that follows them can send data somewhere it shouldn&apos;t or take an action no one approved.
        Telling the model, in its prompt, not to do something is not a control.
      </p>
      <p>
        ClawQL is designed to govern agents from outside the agent. Tool calls that pass through the gateway can be
        decided by rules the agent cannot see, edit, or argue with — when ATR scoping and Panguard enforcement are
        configured. The guarantees apply to the enforced path regardless of which model you use or how it was prompted.
      </p>
      <p>Three principles run through everything below:</p>
      <ul>
        <li>
          <strong>Enforce outside the agent.</strong> Rules live where the agent can&apos;t reach them.
        </li>
        <li>
          <strong>Deterministic first.</strong> Decisions come from types, labels, and specifications, not from another
          model&apos;s judgment.
        </li>
        <li>
          <strong>When in doubt, ask a person.</strong> Anything the rules don&apos;t cover goes to a human, never to a
          guess.
        </li>
      </ul>

      <h2>One tool call, end to end</h2>
      <p>
        <em>Steps 2 to 8 run in the gateway. The agent only ever sees step 1 and the shaped result of step 7.</em>
      </p>
      <ol>
        <li>
          <strong>The agent asks.</strong> It names a tool and its arguments. Anything it read earlier in the session may
          have influenced the request, so ClawQL treats the request with the trust of the least-trusted content behind
          it.
        </li>
        <li>
          <strong>Classify.</strong> The call is mapped to an action type from the API&apos;s own specification
          (OpenAPI, Smithy, a contract ABI). Reads and writes are told apart by the spec, never by a model&apos;s guess.
          A call that can&apos;t be classified goes to a person.
        </li>
        <li>
          <strong>Check.</strong> The action type is checked against the session&apos;s mandate, the scope a person
          confirmed, and the labels on the data involved. Rules are written over types, so rephrasing a request
          doesn&apos;t change the answer.
        </li>
        <li>
          <strong>Approve, if required.</strong> Consequential actions wait for a named person. The approval can be used
          once, and it expires.
        </li>
        <li>
          <strong>Inject credentials.</strong> API keys and tokens come from the vault and are attached at the
          gateway&apos;s proxy. The agent never holds them.
        </li>
        <li>
          <strong>Execute.</strong> The intent is recorded durably before the call, and the call carries an idempotency
          key (see <Link href={site.urls.durability}>/durability</Link>). Outbound traffic can only go where policy
          allows.
        </li>
        <li>
          <strong>Label and shape.</strong> The result is labeled by origin, sensitive fields are redacted, and only the
          fields the agent asked for are returned.
        </li>
        <li>
          <strong>Record.</strong> Local hash-chained WORM is on by default. Remote durable copies (Object Lock or
          equivalent) default on Cloud paid tiers and the regulated profile when configured. The MCP{' '}
          <code>audit</code> tool is a session ring buffer — not that trail.
        </li>
      </ol>

      <h2>The controls</h2>

      <h3>Approvals bound to a person</h3>
      <p>
        A consequential action waits for a specific, authenticated person. Each approval covers one action, can be used
        once, and expires. Where the action supports a dry run, the approval shows its predicted effect rather than just
        the agent&apos;s request.
      </p>

      <h3>Labels that follow the data</h3>
      <p>
        Everything that enters a session is labeled by where it came from. Labels travel with the data through the
        session and into memory, and any context built from untrusted content is itself untrusted.
      </p>

      <h3>Policy over types</h3>
      <p>
        Rules are written against action types and data types, not against strings or command names. Classification comes
        from API specifications. See <Link href={site.urls.ontology}>/ontology</Link>.
      </p>

      <h3>Credentials the agent never holds</h3>
      <p>
        Keys and tokens live in a vault and are attached by the gateway at the moment of the call. They never enter the
        model&apos;s context, logs, or telemetry.
      </p>

      <h3>Egress and redaction</h3>
      <p>
        Outbound traffic is blocked unless policy allows the destination. Sensitive fields can be redacted before they
        leave; results are projected to only the fields the agent asked for.
      </p>

      <h3>A tamper-evident record</h3>
      <p>
        Decisions, approvals, denials, and results are written to a hash-chained trail. Changing, deleting, or reordering
        any entry breaks the chain, detectably. Write-once remote storage needs Object Lock (or equivalent). External
        anchoring of audit roots is design unless a deploy enables it.
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
        AgentDojo attack-success figures are <strong>not</strong> published here: there is no AgentDojo citation or
        artifact in the public repository. Full tables live on <Link href={site.urls.benchmarks}>/benchmarks</Link>.
      </p>

      <h2>What governance doesn&apos;t do</h2>
      <ul>
        <li>
          <strong>It doesn&apos;t make the model right.</strong> ClawQL controls what an agent may do, not whether its
          answers are correct.
        </li>
        <li>
          <strong>It governs what passes through the gateway.</strong> Tool calls routed through ClawQL are covered; a
          container&apos;s internal behavior, or a tool an agent reaches some other way, is not.
        </li>
        <li>
          <strong>Labels are conservative.</strong> Treating anything external as untrusted means some legitimate actions
          will ask a person.
        </li>
        <li>
          <strong>No FedRAMP or SOC 2 Type II report today.</strong> The regulated profile can produce continuous
          evidence; certification is separate work.
        </li>
      </ul>

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
              <td>Built — atomic single-use consume is implemented and tested</td>
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
              <td>Partial — mesh allowlist manifests ship; Cloud egress-proxy guarantee tests remain planned</td>
            </tr>
            <tr>
              <td>Redaction and projection</td>
              <td>Built (Presidio / Stirling in the stack; gateway Presidio remains opt-in)</td>
            </tr>
            <tr>
              <td>Hash-chained audit</td>
              <td>
                Local WORM on by default; remote Object Lock defaults on Cloud paid / regulated when configured
              </td>
            </tr>
            <tr>
              <td>Panguard ATR fail-closed</td>
              <td>
                Opt-in on standard (<code>CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>); forced under regulated
              </td>
            </tr>
            <tr>
              <td>Policy over ontology types</td>
              <td>
                Partial — gateway <Link href={OP_RISK}>operation risk from specs</Link> is built; full ActionType policy
                is design (see <Link href={site.urls.ontology}>/ontology</Link>)
              </td>
            </tr>
            <tr>
              <td>Preview before approval, policy replay</td>
              <td>Design</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DocumentCentered>
  )
}
