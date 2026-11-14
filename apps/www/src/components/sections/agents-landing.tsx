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
    body: 'A Streams subscription points at any event source — WebSocket feed, NATS subject, webhook, cron, API on an interval, or QR stream from an air-gapped system. The agent waits. (The stream_subscribe MCP package is not shipped — planned; Lab 5b proves the celld path today.)',
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
    body: 'memory_recall pulls prior context. Structured ontology queries enumerate exact entities — no near-misses. execute acts on connected backends. Hash-chained audit entries write when the audit path is enabled (write-once needs Object Lock configuration).',
  },
  {
    index: '04',
    title: 'Converge',
    kit: 'Ouroboros',
    body: 'The Ouroboros loop iterates until Seed acceptance criteria are met or hard budgets (rounds, time, tokens, spend) are reached — including stagnation detection. Agents stop when done or when budgeted.',
  },
  {
    index: '05',
    title: 'Surface',
    kit: '/mcp-ui',
    body: 'When a human decision is required, the agent can use auto-generated tool forms and situation-specific HTMX surfaces. The choice is logged on the configured audit path.',
  },
] as const

const benchRows = [
  { arm: 'ClawQL on', score: '3/3 (1.0)', found: '5/5', path: 'structured_predicate' },
  { arm: 'ClawQL off', score: '0/3', found: '0/5', path: 'could not complete' },
  { arm: 'No memory', score: '0/3', found: '0/5', path: 'could not complete' },
] as const

const teeRows = [
  { layer: 'Cosign binary attestation', proves: 'Binary matches the signed clawql-tee digest (design)' },
  { layer: 'WASM capability sandbox', proves: 'Tool code cannot access undeclared capabilities (design)' },
  { layer: 'Attestation-gated virtual keys', proves: 'Model API access only after hardware verification (design)' },
  {
    layer: 'Hash-chained audit trail',
    proves: 'Actions recorded on the configured trail; write-once needs Object Lock (partially shipped)',
  },
  { layer: 'QR air-gap transport', proves: 'Audit reaches verifier via optical channel (planned)' },
  { layer: 'GPU confidential computing', proves: 'Weights and inputs stay in the enclave (design)' },
] as const

const differentiators = [
  {
    index: '01',
    title: 'Event-driven sessions (design)',
    body: 'Streams is designed so significance filters wake agents from events — humans review decisions, not prompts. Lab 5b is the opt-in coordination layer today; agent-facing stream_* tools are planned.',
  },
  {
    index: '02',
    title: 'Recall that closes sets',
    body: 'Semantic similarity cannot enforce a predicate. CQE schemas and ontology.db structured filters enumerate exact sets — every match, no extras. Indexed lookups scale with the index, not “O(1) at any corpus size.”',
  },
  {
    index: '03',
    title: 'Auditability you can prove',
    body: 'Hash-chained audit (write-once where Object Lock is configured) is the shipped trail path. clawql-tee attestation and QR export are design/planned — not a priced product you can buy today.',
  },
] as const

const rylTiers = [
  {
    tier: 'Self-Serve Helm',
    price: 'Early-access pricing — see /pricing',
    detail: 'Helm chart and configuration presets for gateway + agents that ship today',
  },
  {
    tier: 'Managed Deployment',
    price: 'Early-access pricing — see /pricing',
    detail: 'ClawQL-managed infrastructure when early access is available; names identify bundled agents, not endorsements',
  },
  {
    tier: 'Enterprise TEE (planned)',
    price: 'Not sold yet',
    detail: 'clawql-tee, hardware attestation, and QR export are specifications — labeled planned until they ship',
  },
] as const

const verticals = [
  {
    name: 'Legal',
    body: 'Matter ontology and institutional knowledge enumeration — demonstrated on OpenBench mini-firm B-7 (3 tasks / 5 matters)',
  },
  {
    name: 'Government',
    body: 'Planned vertical — outcome accountability and FOIA-oriented document vault patterns; see /industries/government',
  },
  {
    name: 'Lending',
    body: 'Partial samples shipping — intake and HITL; CompliancePlugin and fair-lending checks are planned; see /industries/lending',
  },
  {
    name: 'Surveillance',
    body: 'Planned vertical — chain-of-custody patterns; see /industries/surveillance',
  },
] as const

const securityItems = [
  {
    title: 'Self-hosted',
    body: 'Apache 2.0 packages in this repository. Deploy the gateway and memory stack on your cluster.',
  },
  {
    title: 'Hash-chained audit',
    body: 'Tamper-evident trail when configured; write-once needs Object Lock. MCP audit is a session ring buffer (append/list/clear) — not the examiner trail. Scope of durability evidence: /durability.',
  },
  {
    title: 'ATR scoping',
    body: 'When scoped and enforced, agents can only call tools in scope. Panguard ATR fail-closed enforcement is opt-in in 8.0 (CLAWQL_PANGUARD_PROXY_PLUGIN=1).',
  },
  {
    title: 'Cosign-signed images',
    body: 'Kyverno admission enforcement on the cluster when configured. Unsigned images are rejected at admit time.',
  },
  {
    title: 'clawql-tee (design)',
    body: 'Specification for AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves. QR air-gap audit export is planned. Attestation still trusts chip-vendor root keys.',
  },
  {
    title: '32-module security curriculum',
    body: 'Documented at docs.clawql.com/security.',
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
              Governed gateway, memory, and audit for agents you run — with event-driven and TEE paths labeled as they
              ship.
            </p>
            <p className="agents-hero__lede">
              What ships today: the MCP gateway, vault memory, structured ontology recall, hash-chained audit (write-once
              where configured), and IDP. Streams event wakes and clawql-tee are design/planned. OpenBench mini-firm B-7
              demonstrated structured recall on 3 tasks / 5 matters — not a production proof.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={site.urls.signup} size="lg" color="light">
                Request access
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
            Apache 2.0 packages · Gateway + memory shipped · Streams event wakes planned · OpenBench mini-firm measured
            (3 tasks / 5 matters) · TEE design · Panguard opt-in in 8.0
          </p>
        }
      >
        <p className="max-w-3xl text-[1.05rem] leading-relaxed">
          Start with what runs today. Label event-driven wakes and hardware-verified execution as coming until the
          packages ship.
        </p>
      </Section>

      <Section
        id="loop"
        className="agents-surface"
        eyebrow="How it works"
        headline="The agent loop — shipped pieces and planned wakes"
        subheadline={
          <p>
            Lab 5b coordinates on celld today. Agent-facing stream_* tools and significance-driven wakes are planned —
            many platforms already run agents from triggers; ClawQL&apos;s differentiator is ownership of the trail and
            tools, not inventing event triggers.
          </p>
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
              Exact five-of-five on the mini-firm harness. No near-misses. Two turns. Indexed lookups scale with the
              index — not constant-time at any corpus size.
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
            server on seven shipped surfaces — including <Link href={MCP_UI}>/mcp-ui</Link>. QR optical transport is
            planned as the eighth surface.
          </p>
        }
      >
        <div className="agents-chip-row max-w-4xl">
          {['OpenAPI', 'GraphQL', 'gRPC', 'WebSocket', 'CLI', 'MCP', '/mcp-ui', 'QR (planned)'].map((chip) => (
            <span key={chip} className="agents-chip">
              {chip}
            </span>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-[1.05rem] leading-relaxed">
          A gRPC service talks to a GraphQL consumer. A blockchain node becomes agent-callable. A government audit
          system can stream records through a planned QR optical channel — no network path, air gap structurally
          preserved.
        </p>
        <div className="agents-diff__panel agents-diff__panel--win mt-10 max-w-3xl">
          <p className="agents-diff__label">Seventh shipped surface</p>
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
        headline="clawql-tee — designed for hardware-verified execution"
        subheadline={
          <p>Specification for regulated environments where the operator itself cannot be trusted. Not shipping as a product tier yet.</p>
        }
      >
        <p className="mb-8 max-w-3xl text-[1.05rem] leading-relaxed">
          clawql-tee is designed as a DO-compatible runtime for AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves. Hardware
          attestation still requires trusting the chip vendor&apos;s root keys. The QR optical export channel is planned.
          Do not treat this section as a buyable Enterprise TEE SKU.
        </p>
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="agents-compare min-w-[40rem]">
            <caption>Designed trust chain — each link still trusts named parties (chip vendor roots, Cosign keys, operator config).</caption>
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
        eyebrow="What ClawQL emphasizes"
        headline="Ownership of tools, recall, and the trail"
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
        headline="Agent deployments for regulated industries"
        subheadline={
          <p>
            Founder / lab deployments and early-access packaging — not a roster of external production customers.
            Bundled agent names identify software; they are not endorsements. TEE is planned. Structured recall was
            demonstrated on OpenBench mini-firm (B-7); Harvey LAB firm-knowledge remains the next evidence tier. Full
            catalog: <Link href={site.urls.integrations}>/integrations</Link>.
          </p>
        }
      >
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="agents-compare min-w-[40rem]">
            <caption>RockYourLobster tiers — shipped packaging vs planned TEE.</caption>
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
        headline="Our benchmark traces improve our next run"
        subheadline={
          <p>
            Customer content is never used for training without explicit opt-in — see{' '}
            <Link href={site.urls.dataHandling}>/data-handling</Link>. Only ClawQL&apos;s own benchmark traces, or
            traces from customers who opt in, become SFT/DPO/GRPO data.
          </p>
        }
      >
        <p className="max-w-3xl leading-relaxed">
          OpenBench mini-firm traces close a local loop on our harness: structured-predicate wins become preferred
          SFT/DPO arms. When a Harvey LAB firm-knowledge ledger exists, that third-party scoreboard can become the next
          ground truth — it is not published yet.
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
          <p>
            Hash-chained audit and ATR scoping depend on configuration. Managed tiers may sell a Sovereign Security Pack
            for WORM Object Lock and related controls — see <Link href={site.urls.pricing}>/pricing</Link>. Self-hosted
            Panguard enforcement is opt-in in 8.0.
          </p>
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
        headline="Self-host free. Managed early-access pricing on /pricing."
        subheadline={
          <p>
            Apache 2.0 packages in this repository carry no license fee. Managed figures and any TEE tier live on{' '}
            <Link href={site.urls.pricing}>/pricing</Link> — Enterprise TEE is planned, not sold.
          </p>
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ButtonLink href={site.urls.signup} size="lg">
            Request access
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
              Request early access
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
