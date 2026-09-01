import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { site } from '@/lib/site'

import './agents-landing.css'

const STREAMS_SPEC = `${site.urls.docs}/streams/clawql-streams`
const MCP_UI = `${site.urls.docs}/mcp/mcp-ui`
const ADAPTER = `${site.urls.docs}/mcp/mcp-api-adapter`
const TEE_SPEC = `${site.urls.docs}/streams/clawql-tee`
const DEFENSE = `${site.urls.docs}/security/defense-in-depth`
const K8S = `${site.urls.docs}/deployment/kubernetes`
const MEMORY_ESSAY = 'https://pragmaticvectors.com/posts/memory-finds-ontology-decides/'
const CORRECTNESS_ESSAY = 'https://pragmaticvectors.com/posts/correctness-by-construction/'
const RUBRICS_ESSAY = 'https://pragmaticvectors.com/posts/when-rubrics-become-rewards/'
const ROCKYOURLOBSTER = 'https://rockyourlobster.com'

const loopSteps = [
  {
    index: '01',
    title: 'Listen',
    kit: 'clawql-streams',
    body: 'A stream_subscribe call points at any event source — WebSocket feed, NATS subject, webhook, cron, API on an interval, or QR stream from an air-gapped system. The agent waits.',
  },
  {
    index: '02',
    title: 'Decide',
    kit: 'Significance filter',
    body: 'When an event arrives, the significance filter evaluates whether it warrants an agent session. Below threshold — logged and discarded. Above threshold — agent spawns automatically.',
  },
  {
    index: '03',
    title: 'Act',
    kit: 'Full ClawQL tool surface',
    body: 'memory_recall pulls prior context. Structured ontology queries enumerate exact entities — no near-misses. execute acts on connected backends. Every action writes to the WORM trail before acknowledgment.',
  },
  {
    index: '04',
    title: 'Converge',
    kit: 'Ouroboros',
    body: 'The Ouroboros loop iterates until Seed acceptance criteria are met. The agent does not stop because it ran out of turns. It stops when it is done.',
  },
  {
    index: '05',
    title: 'Surface',
    kit: '/mcp-ui',
    body: 'When a human decision is required, the agent scaffolds a browser interface for that moment — forms from the exact decision needed, HTMX, no frontend project. The choice is logged to WORM.',
  },
] as const

const benchRows = [
  { arm: 'ClawQL on', score: '3/3 (1.0)', found: '5/5', path: 'structured_predicate' },
  { arm: 'ClawQL off', score: '0/3', found: '0/5', path: 'could not complete' },
  { arm: 'No memory', score: '0/3', found: '0/5', path: 'could not complete' },
] as const

const teeRows = [
  { layer: 'Cosign binary attestation', proves: 'Binary is exactly clawql-tee vX.Y, unmodified' },
  { layer: 'WASM capability sandbox', proves: 'Tool code cannot access undeclared capabilities' },
  { layer: 'Attestation-gated virtual keys', proves: 'Model API access only after hardware verification' },
  { layer: 'WORM audit trail', proves: 'Every action recorded before acknowledgment, RPO=0' },
  { layer: 'QR air-gap transport', proves: 'Audit reaches verifier via a channel the operator cannot influence' },
  { layer: 'GPU confidential computing', proves: 'Model weights and inputs never exposed to the host' },
] as const

const differentiators = [
  {
    index: '01',
    title: 'Agents that initiate',
    body: 'Managed platforms wait for a human to start a session. Streams wakes agents when events cross the significance threshold — compliance deadlines, staking drops, outcome divergence. Humans review decisions, not prompts.',
  },
  {
    index: '02',
    title: 'Recall that closes sets',
    body: 'Semantic similarity cannot enforce a predicate. CQE schemas and ontology.db structured filters enumerate exact sets — every match, no extras, O(1) at any corpus size.',
  },
  {
    index: '03',
    title: 'Auditability you can prove',
    body: 'Merkle-chained WORM, LTX replication with RPO=0, hardware attestation via clawql-tee, and QR export to an air-gapped examiner is not a log file. It is a verifiable record of what the agent decided and what the human chose.',
  },
] as const

const rylTiers = [
  {
    tier: 'Self-Serve Helm',
    price: '$299/month',
    detail: 'Helm chart, four agents, security defaults, configuration presets',
  },
  {
    tier: 'Managed Deployment',
    price: '$999/month',
    detail: 'ClawQL-managed infrastructure, direct support channel',
  },
  {
    tier: 'Enterprise TEE',
    price: 'from $3,500/month',
    detail: 'clawql-tee, hardware attestation, WORM audit, QR export, SLA, DPA/BAA',
  },
] as const

const verticals = [
  {
    name: 'Legal',
    body: 'Matter ontology, institutional knowledge enumeration, client preference reconstruction — OpenBench B-7 mechanism-proven',
  },
  {
    name: 'Government',
    body: 'Outcome accountability, Arweave-anchored baselines, FOIA-ready document vault, state auditor API',
  },
  {
    name: 'Lending',
    body: 'Income doc processing, LOS updates, fair lending compliance audit trail',
  },
  {
    name: 'Surveillance',
    body: 'ALPR abuse pattern monitoring, chain of custody for footage, authentication challenge documentation',
  },
  {
    name: 'Events',
    body: 'Live event and concert management, ticket and venue agent automation',
  },
] as const

const securityItems = [
  {
    title: 'Self-hosted or air-gapped',
    body: 'Apache 2.0 core. Full agent stack on your cluster. No forced SaaS data plane.',
  },
  {
    title: 'WORM audit per action',
    body: 'Merkle-chained, LTX-replicated with RPO=0. Every tool call, inference call, and human decision.',
  },
  {
    title: 'ATR scoping',
    body: 'Agents can only call tools declared in their scope. Panguard enforces at tool-call time. Fail-closed.',
  },
  {
    title: 'Cosign-signed images',
    body: 'Kyverno admission enforcement on the cluster. Unsigned images never run.',
  },
  {
    title: 'clawql-tee',
    body: 'Hardware attestation for AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves. GPU confidential computing. QR air-gap audit export.',
  },
  {
    title: '32-module security curriculum',
    body: 'Documented, reproducible, publicly available at docs.clawql.com/security.',
  },
] as const

function AgentsField() {
  return (
    <div className="agents-hero__visual" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
        <ellipse className="agents-orbit agents-orbit--a" cx="720" cy="420" rx="420" ry="220" />
        <ellipse className="agents-orbit agents-orbit--b" cx="720" cy="420" rx="280" ry="340" />
        <path
          className="agents-orbit agents-orbit--c"
          d="M-40 620 C 260 540, 480 700, 720 640 S 1120 520, 1520 600"
        />
        <circle className="agents-node" cx="720" cy="420" r="6" />
        <circle className="agents-node agents-node--late" cx="1040" cy="360" r="5" />
        <circle className="agents-node" cx="480" cy="510" r="4" />
      </svg>
    </div>
  )
}

export function AgentsLanding() {
  return (
    <div className="agents-page">
      <section id="hero" className="agents-hero" aria-labelledby="agents-brand">
        <AgentsField />
        <div className="agents-hero__content mx-auto w-full max-w-7xl px-6 sm:px-8">
          <div className="max-w-3xl">
            <h1 id="agents-brand" className="agents-brand">
              <span>ClawQL</span>
              Agents
            </h1>
            <p className="agents-hero__headline">
              Agents that decide when to act. Interfaces they build for the moment. Audit trails that prove everything.
            </p>
            <p className="agents-hero__lede">
              Agentic infrastructure for regulated production work — event-driven sessions, structured institutional
              recall, hardware-verified execution, and a WORM trail on every action. Mechanism-proven on OpenBench
              mini-firm Calderwood &amp; Harkness tasks (B-7).
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={site.urls.signup} size="lg" color="light">
                Start free trial
              </ButtonLink>
              <PlainButtonLink href={K8S} size="lg" color="light">
                Deploy self-hosted <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
          </div>
        </div>
      </section>

      <Section
        id="trust-strip"
        className="agents-section-band"
        eyebrow="Agentic Platform"
        headline="Built for production, not demo loops"
        subheadline={
          <p>
            Apache 2.0 core · Event-driven, not prompt-driven · OpenBench mini-firm proven · TEE-ready from day one
          </p>
        }
      >
        <p className="max-w-3xl text-[1.05rem] leading-relaxed">
          No human starts the session. No developer builds the interface. Everything is recorded.
        </p>
      </Section>

      <Section
        id="loop"
        className="agents-surface"
        eyebrow="How it works"
        headline="The agent loop that doesn’t wait for you"
        subheadline={
          <p>Every other agent platform requires a human to start the session. ClawQL agents start themselves.</p>
        }
      >
        <ol className="grid max-w-4xl gap-2 md:gap-3">
          {loopSteps.map((step) => (
            <li key={step.index} className="agents-step">
              <div className="agents-step__index">{step.index}</div>
              <h3 className="agents-step__title">{step.title}</h3>
              <p className="agents-step__kit">{step.kit}</p>
              <p className="agents-step__body">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="memory"
        className="agents-section-band"
        eyebrow="The memory layer"
        headline="Institutional knowledge that closes sets, not approximates them"
        subheadline={
          <p>
            Semantic recall returns what looks relevant. Structured ontology recall returns what matches — exactly, with
            no extras.
          </p>
        }
      >
        <p className="mb-8 max-w-3xl text-[1.05rem] leading-relaxed">
          Harvey AI published the Calderwood &amp; Harkness failure mode: agents retrieve near-misses and stop
          confidently, missing exhaustive institutional criteria. We rebuilt that failure in OpenBench as a mini-firm
          harness (B-7), then fixed it structurally with ontology-typed recall — reproducible GitHub Actions runs, not
          Harvey LAB criterion pass rates.
        </p>
        <div className="agents-diff max-w-5xl">
          <div className="agents-diff__panel">
            <p className="agents-diff__label">Without ontology</p>
            <h3 className="agents-diff__title">Keyword / semantic recall</h3>
            <p className="mt-3 leading-relaxed">
              The agent calls memory_recall, gets near-miss results, writes an answer. Any false positive scores zero.
              The task fails even though the agent “did the right thing.”
            </p>
          </div>
          <div className="agents-diff__panel agents-diff__panel--win">
            <p className="agents-diff__label">With ontology</p>
            <h3 className="agents-diff__title">Structured predicate recall</h3>
            <pre className="agents-code" tabIndex={0}>
              {`{
  "query": "matters with escrow and non-compete clauses",
  "schema": "legal.Matter",
  "filters": {
    "escrowPct": { "gte": 10 },
    "nonCompeteMonths": { "gt": 18 }
  },
  "confidenceMinimum": "EXTRACTED"
}`}
            </pre>
            <p className="mt-3 leading-relaxed">
              Exact five-of-five. No near-misses. Two turns. O(1) at any corpus size.
            </p>
          </div>
        </div>
        <p className="mt-8 text-sm" style={{ color: 'var(--agents-muted)' }}>
          OpenBench B-7.1 fair same-files (mini-firm) — run{' '}
          <Link href="https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31255172649">31255172649</Link>
        </p>
        <div className="-mx-6 mt-4 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="agents-compare min-w-[36rem]">
            <caption>OpenBench mini-firm — same notes, same model, different retrieval mechanism.</caption>
            <thead>
              <tr>
                <th scope="col">Arm</th>
                <th scope="col">Score</th>
                <th scope="col">Matters found</th>
                <th scope="col">Retrieval path</th>
              </tr>
            </thead>
            <tbody>
              {benchRows.map((row) => (
                <tr key={row.arm}>
                  <th scope="row">{row.arm}</th>
                  <td>{row.score}</td>
                  <td>{row.found}</td>
                  <td>
                    <code className="font-mono text-[0.9em]">{row.path}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8 max-w-3xl leading-relaxed">
          CQE — ClawQL&apos;s open entity definition format — is how the decision gets written down. The legal Matter
          pack ships with the platform. Lending, government, and surveillance packs follow the same format.
        </p>
        <p className="mt-4">
          <Link href={MEMORY_ESSAY}>Memory Finds. Ontology Decides. — full methodology →</Link>
        </p>
      </Section>

      <Section
        id="protocol"
        className="agents-surface"
        eyebrow="The protocol layer"
        headline="Anything to MCP. MCP to anything."
        subheadline={
          <p>
            ClawQL Core turns any API into an MCP tool. <Link href={ADAPTER}>mcp-api-adapter</Link> exposes any MCP
            server on eight surfaces — including <Link href={MCP_UI}>/mcp-ui</Link>.
          </p>
        }
      >
        <div className="agents-chip-row max-w-4xl">
          {['OpenAPI', 'GraphQL', 'gRPC', 'WebSocket', 'CLI', 'MCP', 'QR', '/mcp-ui'].map((chip) => (
            <span key={chip} className="agents-chip">
              {chip}
            </span>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-[1.05rem] leading-relaxed">
          A gRPC service talks to a GraphQL consumer. A blockchain node becomes agent-callable. A government audit
          system streams records through a QR optical channel — no network path, air gap structurally preserved.
        </p>
        <div className="agents-diff__panel agents-diff__panel--win mt-10 max-w-3xl">
          <p className="agents-diff__label">Eighth surface</p>
          <h3 className="agents-diff__title">/mcp-ui — Swagger UI for MCP</h3>
          <p className="mt-3 leading-relaxed">
            Auto-generated HTMX browser interface from the tool catalog. Every tool becomes a form. Results render
            inline. No JavaScript framework. No build step. Since Core ingests any API into MCP, /mcp-ui becomes a
            browser UI for every connected source — and agents can scaffold situation-specific forms when they need a
            human decision.
          </p>
        </div>
      </Section>

      <Section
        id="tee"
        className="agents-section-band"
        eyebrow="The trust layer"
        headline="clawql-tee — hardware-verified agent execution"
        subheadline={
          <p>For regulated environments where the operator itself cannot be trusted.</p>
        }
      >
        <p className="mb-8 max-w-3xl text-[1.05rem] leading-relaxed">
          Fully DO-compatible runtime supporting AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves. Hardware attestation
          proves what software is running. Vault releases secrets only after verification. GPU confidential computing
          keeps weights and inputs away from the host. Audit leaves the TEE through a QR optical channel — fountain
          codes, encryption, HMAC, Merkle verification.
        </p>
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="agents-compare min-w-[40rem]">
            <caption>The complete zero-trust chain — no single link requires trusting any party.</caption>
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">What it proves</th>
              </tr>
            </thead>
            <tbody>
              {teeRows.map((row) => (
                <tr key={row.layer}>
                  <th scope="row">{row.layer}</th>
                  <td>{row.proves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8">
          <Link href={CORRECTNESS_ESSAY}>Correctness by Construction — Erlang · OxCaml · SPARK applied to clawql-tee →</Link>
        </p>
        <p className="mt-3">
          <Link href={TEE_SPEC}>clawql-tee specification →</Link>
        </p>
      </Section>

      <Section
        id="differentiators"
        className="agents-surface"
        eyebrow="Three things other agent platforms can’t do"
        headline="What changes when the infrastructure is right"
      >
        <ol className="grid max-w-4xl gap-2">
          {differentiators.map((item) => (
            <li key={item.index} className="agents-step">
              <div className="agents-step__index">{item.index}</div>
              <h3 className="agents-step__title">{item.title}</h3>
              <p className="agents-step__body">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="rockyourlobster"
        className="agents-section-band"
        eyebrow="RockYourLobster"
        headline="Enterprise agent deployments for regulated industries"
        subheadline={
          <p>
            Hardened OpenClaw, Hermes, Pi, and Goose agents — running in clawql-tee, preconfigured with ClawQL&apos;s
            32-module security curriculum. Structured recall is mechanism-proven on OpenBench mini-firm (B-7); Harvey
            LAB firm-knowledge remains the next evidence tier.
          </p>
        }
      >
        <p className="mb-8 max-w-3xl text-[1.05rem] font-medium leading-relaxed" style={{ color: 'var(--agents-ink)' }}>
          The security and advanced capabilities are only possible because of ClawQL.
        </p>
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="agents-compare min-w-[40rem]">
            <caption>RockYourLobster tiers — TEE deployments for regulated buyers.</caption>
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col">Price</th>
                <th scope="col">What&apos;s included</th>
              </tr>
            </thead>
            <tbody>
              {rylTiers.map((row) => (
                <tr key={row.tier}>
                  <th scope="row">{row.tier}</th>
                  <td>{row.price}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8">
          <Link href={ROCKYOURLOBSTER}>rockyourlobster.com →</Link>
        </p>
      </Section>

      <Section
        id="flywheel"
        className="agents-surface"
        eyebrow="The training flywheel"
        headline="Every session makes the next one better"
        subheadline={
          <p>
            Passing traces become SFT data. Paired pass/fail traces become DPO pairs. Verifiable rewards feed GRPO when
            ground truth is automatic. Better sessions grow the dataset that fine-tunes the next run.
          </p>
        }
      >
        <p className="max-w-3xl leading-relaxed">
          OpenBench mini-firm traces already close a local loop: structured-predicate wins become preferred SFT/DPO
          arms. When a Harvey LAB firm-knowledge ledger exists, that third-party scoreboard becomes the next ground
          truth for the fine-tune that improves the next result — it is not published yet.
        </p>
        <p className="mt-4">
          <Link href={RUBRICS_ESSAY}>When Rubrics Become Rewards →</Link>
        </p>
      </Section>

      <Section
        id="verticals"
        className="agents-section-band"
        eyebrow="Verticals"
        headline="Start where the agent need is loudest"
        subheadline={
          <p>Domain vertical packages are plugin presets — CQE schemas, domain tools, and workflows — not separate products.</p>
        }
      >
        <ul className="agents-verticals max-w-5xl">
          {verticals.map((v) => (
            <li key={v.name} className="agents-vertical">
              <h3 className="agents-vertical__name">{v.name}</h3>
              <p className="agents-vertical__body">{v.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link href="/industries/">Browse all industries →</Link>
        </p>
      </Section>

      <Section
        id="security"
        className="agents-surface"
        eyebrow="Security and compliance"
        headline="Built for examiners"
        subheadline={
          <p>Sovereignty and auditability are defaults — not a separate enterprise pack negotiated after the pilot.</p>
        }
      >
        <ul className="agents-security max-w-4xl">
          {securityItems.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <p className="mt-1 leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link href={DEFENSE}>Defense-in-depth reference →</Link>
        </p>
      </Section>

      <Section
        id="pricing"
        className="agents-section-band"
        eyebrow="Pricing"
        headline="$29/month to start. $3,500/month for enterprise TEE."
        subheadline={
          <p>
            Self-host free on Apache 2.0, or start a 14-day Developer trial. One MCP endpoint on every tier — same URL
            when you upgrade.
          </p>
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ButtonLink href={site.urls.signup} size="lg">
            Start free trial
          </ButtonLink>
          <PlainButtonLink href={site.urls.pricing} size="lg">
            Compare all plans <ArrowNarrowRightIcon />
          </PlainButtonLink>
          <PlainButtonLink href={site.urls.contact} size="lg">
            Talk to us
          </PlainButtonLink>
        </div>
        <p className="mt-6 text-sm" style={{ color: 'var(--agents-muted)' }}>
          Streams loop and TEE specs:{' '}
          <Link href={STREAMS_SPEC}>clawql-streams</Link>
          {' · '}
          <Link href={TEE_SPEC}>clawql-tee</Link>
          {' · '}
          <Link href={MCP_UI}>/mcp-ui</Link>
        </p>
      </Section>

      <CallToActionSimpleCentered
        id="cta"
        headline="Is this the agent infrastructure you’ve been looking for?"
        subheadline={
          <p>
            Engineering and compliance teams: start with the gateway and memory. When you need structured ontology
            recall, Streams event triggers, or clawql-tee for regulated environments — it&apos;s the same endpoint, no
            second vendor conversation.
          </p>
        }
        cta={
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ButtonLink href={site.urls.signup} size="lg">
              Start 14-day trial
            </ButtonLink>
            <PlainButtonLink href={K8S} size="lg">
              Deploy self-hosted <ArrowNarrowRightIcon />
            </PlainButtonLink>
            <PlainButtonLink href={site.urls.contact} size="lg">
              Talk to us
            </PlainButtonLink>
          </div>
        }
      />
    </div>
  )
}
