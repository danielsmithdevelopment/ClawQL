import { Document } from '@/components/elements/document'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { site } from '@/lib/site'

import type { ReactNode } from 'react'

const toc = [
  { href: '#executive-summary', label: 'Executive summary' },
  { href: '#two-entry-points', label: 'The two entry points' },
  { href: '#expansion-ladder', label: 'The expansion ladder' },
  { href: '#security-dossier', label: 'Hardened Security Dossier' },
  { href: '#agentic-fabric', label: 'Zero-Trust Agentic Fabric' },
  { href: '#sales-objections', label: 'Sales quick reference' },
  { href: '#why-nobody-else', label: 'Why nobody else can run this' },
  { href: '#pricing', label: 'Pricing reinforces the strategy' },
  { href: '#segments', label: 'Target segments' },
  { href: '#moat', label: 'Moat at each stage' },
  { href: '#inference-optional', label: 'Inference-optional MCP path' },
  { href: '#execution', label: 'GTM execution plan' },
  { href: '#positioning', label: 'One-sentence positioning' },
] as const

/** PragmaticVectors — technical verification library for the GTM expansion ladder. */
const pv = {
  origin: 'https://pragmaticvectors.com',
  series: 'https://pragmaticvectors.com/series/hardened-agentic-stack',
  twelveLayers: 'https://pragmaticvectors.com/posts/twelve-layers-llm-cost/',
  memoryResidency: 'https://pragmaticvectors.com/posts/hardened-agentic-13-memory-residency/',
  observabilityLoop: 'https://pragmaticvectors.com/posts/hardened-agentic-08-observability-loop/',
  kernelSaidNo: 'https://pragmaticvectors.com/posts/macos-seatbelt-agent-sandbox/',
  miniShaiHulud: 'https://pragmaticvectors.com/posts/mini-shai-hulud-supply-chain/',
  supplyChainSigning: 'https://pragmaticvectors.com/posts/hardened-agentic-12-supply-chain-signing/',
  zeroTrustIngest: 'https://pragmaticvectors.com/posts/hardened-agentic-01-zero-trust-ingest/',
  anomalousToolUse: 'https://pragmaticvectors.com/posts/hardened-agentic-09-anomalous-tool-use/',
  replaceLitellm: 'https://pragmaticvectors.com/posts/replace-litellm-clawql-inference/',
  processContainment: 'https://pragmaticvectors.com/posts/hardened-agentic-04-process-containment/',
  toolSandbox: 'https://pragmaticvectors.com/posts/hardened-agentic-07-tool-sandbox/',
} as const

function Callout({ children }: { children: ReactNode }) {
  return <blockquote>{children}</blockquote>
}

function ScrollTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export function InferenceGtmPlaybook() {
  return (
    <Section id="playbook" className="pt-0">
      <div className="flex flex-col gap-10">
        <nav aria-label="Playbook contents" className="mx-auto w-full max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-mist-500 uppercase">In this playbook</p>
          <ol className="mt-3 grid gap-2 text-sm text-mist-700 sm:grid-cols-2 dark:text-mist-300">
            {toc.map((item, index) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-mist-950 dark:hover:text-white">
                  <span className="text-mist-400 tabular-nums">{String(index + 1).padStart(2, '0')}</span> {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <Document className="mx-auto w-full max-w-3xl">
          <p>
            This playbook defines ClawQL’s <strong>default</strong> go-to-market motion:{' '}
            <strong>the Agentic Gateway as the Foundational Platform for Auditable Production AI</strong>. Developers
            land with OpenAI-compatible inference and a locally hosted MCP server, then expand product-led into memory,
            model provenance, documents, payments, and the Zero-Trust Agentic Fabric — Regional Hubs, Dedicated Virtual
            Gateways (Audit-Trail Enforcement Points with NATS JetStream + Valkey), and Edge Gateways on every laptop.
            For the secondary enterprise / Palantir-facing motion, see the{' '}
            <Link href={site.urls.enterpriseGtm}>Enterprise GTM playbook</Link>.
          </p>

          <div className="not-prose my-8 grid gap-4 sm:grid-cols-2">
            {[
              {
                label: 'Primary positioning',
                value: 'Agentic Gateway',
                sub: 'Foundational Platform for Auditable Production AI',
              },
              {
                label: 'Entry binary',
                value: 'One gateway, two protocols',
                sub: '/v1 chat completions and /mcp from one process',
              },
              {
                label: 'Core GTM motion',
                value: 'Adoption-led expansion',
                sub: 'Inference or MCP → optimization → provenance → Dedicated VG → Edge swarm → IDP',
              },
              {
                label: 'Business outcome',
                value: 'Auditable Production AI',
                sub: 'Three-layer fabric: usage, intent, and execution audits — plus model provenance',
              },
            ].map((item) => (
              <div key={item.label} className="border-t border-mist-200 pt-3 dark:border-white/15">
                <p className="text-xs font-semibold tracking-wide text-mist-500 uppercase">{item.label}</p>
                <p className="mt-1 text-base font-semibold text-mist-950 dark:text-white">{item.value}</p>
                <p className="mt-1 text-xs text-mist-500">{item.sub}</p>
              </div>
            ))}
          </div>

          <h2 id="executive-summary">Executive summary: the strategic reframe</h2>
          <p>
            ClawQL’s GTM motion has evolved from a broad platform pitch to a focused, adoption-led strategy. The Agentic
            Gateway is the Foundational Platform for Auditable Production AI — realized as a Zero-Trust Agentic Fabric:
            Regional Hubs for multi-tenant routing and billing, Dedicated Virtual Gateways for isolated policy and
            event-driven swarm coordination, and Edge Gateways on every engineer laptop for local execution in the mesh.
          </p>
          <Callout>
            ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.
          </Callout>
          <p>
            Developers land with an OpenAI-compatible inference control plane and native <code>/mcp</code> access, then
            expand product-led into persistent memory, the fine-tuning Flywheel, Dedicated Virtual Gateway governance
            (NATS JetStream + Valkey), and a fleet of Edge Gateways that turn the company into a distributed agentic
            swarm. This three-minute install is the beginning of an expansion path that evolves a developer’s workflow
            into a fully compliant, production-grade agentic fabric.
          </p>
          <p>
            The Agentic Gateway is not merely a proxy; it is the infrastructure core that solves the “Agent Sprawl”
            problem. It integrates HTTP/REST inference routing and MCP tool-calling into one binary, creating a single
            surface for policy enforcement, audit logging, and state management — then scales into Regional Hubs,
            Dedicated Virtual Gateways, and Edge nodes without changing the developer’s entry point.
          </p>

          <h3>The architecture question that defines our market leadership</h3>
          <p>How many inference gateways provide the foundational platform requirements for Auditable Production AI?</p>
          <ul>
            <li>
              <strong>Architectural governance:</strong> Dedicated Virtual Gateways as Audit-Trail Enforcement Points —
              isolated policy, WORM-auditable trails, and NATS JetStream + Valkey for event-driven swarm workflows —
              federated across regions when customers choose, never as a single global master.
            </li>
            <li>
              <strong>Stateful intelligence:</strong> Built-in persistent, cross-session memory that survives restarts.
            </li>
            <li>
              <strong>Integrated pipeline:</strong> An IDP document processing pipeline that feeds the same semantic
              search layer as the inference gateway.
            </li>
            <li>
              <strong>Model provenance:</strong> A fine-tuning Flywheel that turns production traffic into proprietary
              models, backed by verifiable supply-chain integrity.
            </li>
            <li>
              <strong>Agentic economics:</strong> Native payment rails (Stripe + x402 + MPP) to monetize tools and
              agents directly at the gateway layer.
            </li>
          </ul>
          <p>
            The answer is zero. The Agentic Gateway is the entry point. The Foundational Platform is what makes it the
            standard for production-grade, auditable AI.
          </p>

          <h2 id="two-entry-points">The two entry points</h2>
          <h3>Entry point 1: Inference gateway (OpenAI drop-in)</h3>
          <p>For any developer currently using OpenAI, Anthropic, Groq, Together, or Ollama:</p>
          <pre>
            <code>{`npx clawql-inference
export OPENAI_BASE_URL=http://localhost:8080/v1
# Existing code runs unchanged. Nothing else required.`}</code>
          </pre>
          <p>
            This developer is immediately inside ClawQL’s ecosystem. Their inference calls hit the WORM call store. The
            12-layer efficiency stack begins working. The PAL routing ladder starts building data on which tier each
            task type needs. The Intelligence Flywheel begins accumulating training signal.
          </p>
          <p>
            They haven’t changed a line of application code. They haven’t evaluated a pitch deck. They just made their
            existing setup better.
          </p>

          <h3>Entry point 2: MCP server (IDE-native)</h3>
          <p>
            For any developer using Cursor, Claude Code, or Codex who wants to connect to local or private APIs without
            routing inference through ClawQL at all:
          </p>
          <pre>
            <code>{`clawql inference serve --port 8080
# In Cursor MCP settings:
# URL: http://localhost:8080/mcp
# That's it.`}</code>
          </pre>
          <p>
            The Agentic Gateway exposes <code>/mcp</code> alongside <code>/v1/chat/completions</code>. The IDE connects
            via MCP protocol. The developer immediately gets:
          </p>
          <ul>
            <li>ClawQL’s full tool catalog (search + execute across any configured API)</li>
            <li>
              Vault memory (<code>memory_ingest</code> + <code>memory_recall</code> across sessions)
            </li>
            <li>Document pipeline tools if IDP is enabled</li>
            <li>WORM audit trail on every tool invocation</li>
            <li>
              Seatbelt containment via <code>clawql sandbox init</code>
            </li>
          </ul>
          <p>
            This is the original MCP-first deployment plan, now unified in the Agentic Gateway. The same binary handles
            both. The Edge Agentic Gateway on a laptop <em>is</em> the locally hosted MCP server. They are not two
            separate products — they are two protocols exposed by one Foundational Platform.
          </p>
          <Callout>
            A developer who starts with the MCP entry point and never routes inference through ClawQL is still building
            habits, muscle memory, and dependency on ClawQL’s tool catalog and memory vault. When they want to add
            inference routing, token efficiency, or the fine-tuning flywheel, they’re already inside the ecosystem.
          </Callout>

          <h2 id="expansion-ladder">The expansion ladder toward Auditable Production AI</h2>
          <p>
            Every ClawQL user starts on one of the two entry points. The expansion path is product-led — each stage is
            an evolution toward Auditable Production AI. No sales motion required until the Virtual Gateway conversation
            (the Audit-Trail Enforcement Point).
          </p>

          <h3>Week 1: Production visibility</h3>
          <p>
            <strong>Inference entry:</strong> Developer runs <code>clawql inference spend --group-by team</code>. For
            the first time they can see which calls are expensive, which models are being used, and what the cost
            attribution looks like per team — the first artifact of an auditable production trail. This report is often
            surprising — and hard to generate from OpenRouter or LiteLLM without significant custom instrumentation.
          </p>
          <p>
            <strong>MCP entry:</strong> Developer runs <code>memory_recall</code> for the first time and retrieves
            context from a session three weeks ago. The agent remembers what decisions were made, what was tried, what
            failed. Stateful intelligence replaces the “what were we doing?” tax that breaks production continuity.
          </p>
          <p>
            In both cases, the value is immediate and concrete. No onboarding. No training. No integration work beyond
            the initial setup.
          </p>

          <h3>Week 2: Infrastructure optimization — semantic cache</h3>
          <p>
            Enable semantic cache (<code>CLAWQL_INFERENCE_SEMANTIC_CACHE=1</code>). Cache hits start appearing in the
            call store. Cost drops measurably on repeated similar requests. The call store now shows{' '}
            <code>cache_hit: true</code> on a growing fraction of calls — infrastructure optimization for auditable
            production, not a theoretical efficiency claim.
          </p>
          <p>
            This is the first moment where ClawQL demonstrably costs less than the alternative as a visible line item in
            the spend report, with every hit recorded in the same WORM-backed trail.
          </p>

          <h3>Week 3: Infrastructure optimization — PAL routing</h3>
          <p>
            Enable routing (<code>CLAWQL_INFERENCE_ROUTING_ENABLED=1</code>). Decomposed sub-tasks start routing to
            Frugal tier (local Ollama or Phi-4). Top-level orchestration stays on Standard. Frontier only fires on
            genuine escalation.
          </p>
          <p>
            The bill drops again. The call store shows tier distribution: what fraction of calls resolved at Frugal,
            Standard, or Frontier. Routing decisions become part of the auditable production record — not opaque spend.
          </p>

          <h3>Month 2: Model provenance — the Flywheel</h3>
          <p>The call store has accumulated 500–2,000 verified training examples. The developer runs:</p>
          <pre>
            <code>{`clawql inference export \\
  --verdict passed \\
  --format openai-jsonl \\
  --output ./training-data/$(date +%Y-%m).jsonl`}</code>
          </pre>
          <p>
            Presidio scrubs PII automatically. The WORM manifest records exactly what entered the training dataset. The
            developer submits the fine-tuning job:
          </p>
          <pre>
            <code>{`clawql inference finetune \\
  --dataset ./training-data/2026-07.jsonl \\
  --base-model gpt-4o-mini \\
  --provider openai`}</code>
          </pre>
          <p>
            The fine-tuned model registers back to <code>tier-map.json</code> as a custom Frugal tier. PAL routing uses
            it automatically for matching task types. This is <strong>model provenance for auditable production</strong>{' '}
            — not only efficiency. The Frugal tier is more accurate than the generic model it replaced because it was
            trained on this developer’s actual production traces, with WORM-recorded lineage of what entered the
            training set.
          </p>
          <Callout>
            This is the moment that creates lock-in — not contractual lock-in, value lock-in. The custom Frugal model
            lives in ClawQL’s tier-map with verifiable provenance. Moving to a different inference gateway means giving
            up that model asset and starting training-data accumulation from scratch.
          </Callout>

          <h3>Month 3: Stateful intelligence — memory across sessions</h3>
          <p>
            The developer enables persistent memory across their team. <code>memory_ingest</code> starts capturing
            architectural decisions, debugging context, and runbook notes. <code>memory_recall</code> retrieves them in
            new sessions without anyone having to paste context — stateful intelligence required for production agents
            that must remain continuous and reviewable.
          </p>
          <p>
            This is available on the Developer tier ($29/mo) but it changes how the team works. Context that was
            previously lost between sessions now persists. Agents stop asking “what were we doing?” and start asking
            “what happened since last time?”
          </p>

          <h3>Month 4–6: Audit-trail enforcement — Dedicated Virtual Gateway</h3>
          <p>
            The team grows. Different projects need different policies. The developer wants per-project audit trails,
            per-team budget caps, and isolation between workloads. This is the Dedicated Virtual Gateway conversation —
            the <strong>Audit-Trail Enforcement Point</strong> that CISOs and compliance teams require to authorize
            production AI.
          </p>
          <p>
            Per-team virtual keys with USD budget caps are already available (
            <code>clawql inference keys create --team engineering --budget 500</code>). Customers start on ClawQL’s
            multi-tenant Regional Hubs for routing and billing, then upgrade to a Dedicated Virtual Gateway — deployed
            into the same region or their own cloud — that keeps policy, WORM sinks, and observability isolated while
            still consuming Regional Hub routing and billing.
          </p>
          <p>
            This is when the first real sales conversation happens — not to sell ClawQL (the developer is already sold)
            but to scope deployment model, SLA, and Dedicated Virtual Gateway placement (ClawQL region vs customer VPC).
          </p>

          <h3>Month 6+: Integrated pipeline — IDP and documents</h3>
          <p>
            The developer is processing documents — contracts, invoices, reports — and wants agents to read, classify,
            extract, and query them through the same MCP interface they’re already using.
          </p>
          <pre>
            <code>{`# Same endpoint, new tools
clawql sources add https://your-nextcloud-instance/api
# run_idp_pipeline, classify_document, extract_document
# now available in the same MCP server`}</code>
          </pre>
          <p>
            The IDP doesn’t require a new deployment. It activates behind the same endpoint via the plugin bundle model.
            The developer upgrades to Starter ($299/mo) and document processing appears in their existing Cursor /
            Claude Code MCP session.
          </p>
          <Callout>
            This is the IDP sale completing itself. The developer didn’t evaluate an IDP platform. They evaluated an
            inference gateway, expanded to memory, and eventually discovered documents could flow through the same
            system they were already using. The IDP is an upsell from trust, not a standalone evaluation.
          </Callout>

          <h2 id="security-dossier">Hardened Security Dossier — technical verification by expansion stage</h2>
          <p>
            Enterprise buyers and CISOs do not buy abstract security claims. They buy architectures they can verify. The{' '}
            <Link href={pv.origin}>PragmaticVectors</Link> library — especially the{' '}
            <Link href={pv.series}>Hardened Agentic Stack</Link> series — is the proof-of-competence dossier for every
            stage of the expansion ladder. When a buyer asks “how do you secure this?”, the answer is a published
            engineering standard, not a marketing slide.
          </p>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Expansion stage</th>
                  <th>Business outcome</th>
                  <th>Technical verification (whitepaper)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Inference Gateway</td>
                  <td>Infrastructure optimization</td>
                  <td>
                    <Link href={pv.twelveLayers}>The Twelve Layers of LLM Cost</Link>
                  </td>
                </tr>
                <tr>
                  <td>Memory / IDP</td>
                  <td>Stateful intelligence</td>
                  <td>
                    <Link href={pv.memoryResidency}>Local Data Residency: Securing Obsidian and JSONL</Link>
                  </td>
                </tr>
                <tr>
                  <td>Dedicated Virtual Gateway</td>
                  <td>Audit-trail enforcement</td>
                  <td>
                    <Link href={pv.observabilityLoop}>The Observability Loop: Correlating Intent to Action</Link>
                  </td>
                </tr>
                <tr>
                  <td>Edge Agentic Swarm</td>
                  <td>Sovereign execution</td>
                  <td>
                    <Link href={pv.kernelSaidNo}>The Kernel Said No: Containment on macOS</Link>
                  </td>
                </tr>
                <tr>
                  <td>Governance / CISO</td>
                  <td>Auditable Production AI</td>
                  <td>
                    <Link href={pv.miniShaiHulud}>The Mini Shai-Hulud Worm: Layered Defense</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Sales quick reference</h3>
          <p>Map the objection to the essay — educate first, then show that ClawQL implements the same architecture.</p>
          <ul>
            <li>
              <strong>Supply chain:</strong>{' '}
              <Link href={pv.supplyChainSigning}>Supply Chain Trust: Signing Images and Artifacts</Link> ·{' '}
              <Link href={pv.miniShaiHulud}>Mini Shai-Hulud</Link>
            </li>
            <li>
              <strong>LiteLLM migration:</strong>{' '}
              <Link href={pv.replaceLitellm}>Replacing LiteLLM After the March 2026 Supply Chain Compromise</Link>
            </li>
            <li>
              <strong>Runtime isolation (Kata / sandbox):</strong>{' '}
              <Link href={pv.toolSandbox}>Building the Sandbox: Isolated Tool Execution</Link> ·{' '}
              <Link href={pv.processContainment}>Process Containment (Tetragon / eBPF)</Link>
            </li>
            <li>
              <strong>Regional Hub → Dedicated VG onboarding:</strong>{' '}
              <Link href={pv.zeroTrustIngest}>Zero-Trust Ingest</Link> ·{' '}
              <Link href={pv.anomalousToolUse}>Anomalous Tool Use Detection</Link>
            </li>
          </ul>
          <Callout>
            This is education-led sales. A buyer who adopts ClawQL because they read <em>The Kernel Said No</em> and{' '}
            <em>Process Containment</em> is buying an architectural philosophy — not just a SKU. The moat is
            intellectual as much as it is technical.
          </Callout>

          <h2 id="agentic-fabric">Zero-Trust Agentic Fabric — the enterprise architecture</h2>
          <p>
            ClawQL’s Foundational Platform is not a single global proxy. It is a{' '}
            <strong>Zero-Trust Agentic Fabric</strong> — the distributed agentic operating system for Auditable
            Production AI: multi-tenant <strong>Regional Hubs</strong> (billing/routing), customer-owned{' '}
            <strong>Dedicated Virtual Gateways</strong> (governance + NATS nervous system), and{' '}
            <strong>Edge Gateways</strong> on every laptop (execution). Full technical specification:{' '}
            <Link href={`${site.urls.docs}/architecture/agentic-fabric`}>
              docs.clawql.com/architecture/agentic-fabric
            </Link>
            . Typed enterprise grounding (open Ontology, kinetic actions, Git vs R2):{' '}
            <Link href={`${site.urls.docs}/architecture/enterprise-ontology`}>
              docs.clawql.com/architecture/enterprise-ontology
            </Link>
            .
          </p>
          <Callout>
            Global master gateways are an anti-pattern: SPOF, compliance bottleneck, identical policy overhead for every
            team, concentrated supply-chain target. Prefer federated Virtual Gateways that share EnterpriseGovernance
            truth but enforce and audit locally. Regional Hub ≠ policy brain.
          </Callout>

          <h3>Layer 1 — Regional Hub (SaaS / shared)</h3>
          <p>
            ClawQL-operated, multi-tenant by default. Customers connect to one or multiple hubs. This is the “cloud
            pipe” — transactional plumbing so teams start today without a VPC.
          </p>
          <ul>
            <li>
              <strong>Does:</strong> model routing, billing metering, usage attribution, provider load balancing
            </li>
            <li>
              <strong>Does not:</strong> hold tenant manifests, write tenant intent/execution WORM, see raw PII on
              sovereign paths, or store customer sovereign secrets
            </li>
            <li>
              <strong>Audit role:</strong> usage audit — what was called, at what cost
            </li>
          </ul>

          <h3>Layer 2 — Dedicated Virtual Gateway (governance / private)</h3>
          <p>
            The primary enterprise entry point — the company’s “brain.” Deployed into a ClawQL region or the customer’s
            VPC/on-prem. Usage and billing still flow through Regional Hubs; <strong>everything else</strong> couples to
            the Dedicated VG.
          </p>
          <ul>
            <li>
              <strong>Function:</strong> Audit-Trail Enforcement Point; EnterpriseGovernance; PII/PHI scrubbing; private
              WORM; <strong>NATS JetStream + Valkey</strong> swarm fabric
            </li>
            <li>
              <strong>Federation:</strong> multiple VGs as peers (not spokes under a global master) — EU enforcement
              stays in EU; optional cross-gateway tool routing under explicit policy
            </li>
            <li>
              <strong>Audit role:</strong> intent audit — why an action was authorized
            </li>
          </ul>

          <h3>Layer 3 — Edge Agentic Gateway (developer laptop / swarm node)</h3>
          <p>
            Same Agentic Gateway binary class, deployed locally: MCP for Cursor/Claude Code, local Frugal inference,
            vault memory, NATS task subscriber, Seatbelt containment, WORM relay.
          </p>
          <ul>
            <li>
              <strong>Sync:</strong> VG <em>pushes</em> policy; Edge <em>pushes</em> WORM-signed audit bundles — offline
              first, online governed
            </li>
            <li>
              <strong>Shadow IT inversion:</strong> developers prefer the Edge node because it unlocks corporate memory,
              documents, and swarm topics
            </li>
            <li>
              <strong>Audit role:</strong> execution audit — what actually ran on the workstation
            </li>
          </ul>

          <h3>Three audits, one forensic narrative</h3>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Audit surface</th>
                  <th>What the CISO reconstructs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Regional Hub</td>
                  <td>Usage audit</td>
                  <td>Tokens, models, billing — not private policy contents</td>
                </tr>
                <tr>
                  <td>Dedicated Virtual Gateway</td>
                  <td>Intent audit</td>
                  <td>Policies, authorizations, tool permissions, WORM in the audit boundary</td>
                </tr>
                <tr>
                  <td>Edge Agentic Gateway</td>
                  <td>Execution audit</td>
                  <td>Fine-grained local runs, synced as signed bundles when online</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>
          <p>
            Usage proves what was called. Intent proves why it was allowed. Execution proves what happened. An auditor
            querying the Dedicated VG gets the composed record without centralizing raw source or personal context.
          </p>

          <h3>Sovereign handshakes</h3>
          <ul>
            <li>
              <strong>VG → Regional Hub:</strong> VG initiates (pull — no inbound into tenant VPC). mTLS identity →
              GovernanceSync (manifest hash) → stream for routing/billing signals. Heartbeat timeout = kill switch
              (fail-closed). Hash mismatch → DEGRADED_MODE + WORM event.
            </li>
            <li>
              <strong>Edge → VG:</strong> identity pinning → policy push (local enforce) → audit-bundle push on schedule
              or reconnect. Offline Edges queue WORM; trail never discarded.
            </li>
          </ul>

          <h3>Event-driven fabric — NATS JetStream + Valkey</h3>
          <p>
            Each Dedicated VG hosts its own JetStream and Valkey. This is baked into the VG definition — not a bolted-on
            Phase 4. Subject hierarchy and Valkey schemas are specified in the{' '}
            <Link href={`${site.urls.docs}/architecture/agentic-fabric`}>architecture doc</Link> (
            <code>clawql.tasks.*.broadcast</code>,{' '}
            <code>clawql.problems.&#123;id&#125;.open|attempt|solved|closed</code>, audit relay, policy updates).
          </p>
          <h4>Collaborative problem-solving</h4>
          <ol>
            <li>
              <strong>Publish</strong> — stuck Edge opens a problem topic; VG initializes Valkey problem state
            </li>
            <li>
              <strong>Parallel execute</strong> — Edges pull attempts, avoid redundant work, publish progress
            </li>
            <li>
              <strong>Breakthrough</strong> — first solver publishes <code>.solved</code>; peers stop; VG validates
            </li>
            <li>
              <strong>Close</strong> — originator notified; full WORM chain for the session
            </li>
          </ol>
          <h4>CTO / CISO orchestration</h4>
          <p>
            Signed mandates on task broadcast subjects (security patches, weekly summaries). Every Edge validates the
            issuer, executes locally, reports results. VG aggregates coverage %, failures, and a non-repudiable
            completion WORM entry. Mandates are system events — not email.
          </p>
          <Callout>
            Orchestration loop: Broadcast → Pull → Execute → Report. Optional agentic payment rails can credit
            identities for completed automation work.
          </Callout>
          <h4>Federated mesh</h4>
          <ul>
            <li>Peer policy sync; Independent Policy Enforcement Points</li>
            <li>Cross-gateway tool routing under explicit policy</li>
            <li>Local WORM + mesh observability without centralizing raw sensitive payloads</li>
            <li>Explicit registries and mTLS — not open discovery</li>
          </ul>

          <h3>VG buying triggers & 90-day onboarding</h3>
          <p>The VG conversation opens when a Teams customer says any of:</p>
          <ul>
            <li>“Different projects need different policies” — isolation</li>
            <li>“Our CISO needs to own the audit trail” — compliance</li>
            <li>“We want models on our own hardware” — sovereignty</li>
          </ul>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Days</th>
                  <th>Activity</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1–7</td>
                  <td>Deploy VG; mTLS to Regional Hub; WORM sink to customer storage</td>
                  <td>Traffic through VG; customer owns audit storage</td>
                </tr>
                <tr>
                  <td>8–21</td>
                  <td>Publish EnterpriseGovernance; Presidio; kinetic guardrails</td>
                  <td>Policy enforcement active in the audit boundary</td>
                </tr>
                <tr>
                  <td>22–45</td>
                  <td>Enable NATS + Valkey; pilot Edge Gateways on 2–3 laptops</td>
                  <td>First swarm / mandate demo</td>
                </tr>
                <tr>
                  <td>46–90</td>
                  <td>Fleet Edge Gateways; first org-wide CTO/CISO mandate</td>
                  <td>Agentic Fabric operational for the account</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Sales framing</h3>
          <ul>
            <li>
              <strong>CTO:</strong> Manage agents at the Edge, govern through your Dedicated VG, ClawQL Regional Hubs
              handle multi-tenant routing and billing.
            </li>
            <li>
              <strong>CISO:</strong> Policy and WORM stay in your audit boundary. Regional Hubs see billing/routing
              signals — not private enforcement contents. “Verify us, don’t trust us.”
            </li>
          </ul>

          <h3>Sovereign Execution Environment — safety switches</h3>
          <p>
            Kill switches are runtime primitives: mTLS identity + <Link href={pv.toolSandbox}>Kata / sandbox</Link> +{' '}
            <Link href={pv.processContainment}>Tetragon / eBPF</Link> + Falco + VG WORM. Essay map:{' '}
            <Link href="#security-dossier">Hardened Security Dossier</Link>.
          </p>

          <h2 id="sales-objections">Sales quick reference — competitive objections</h2>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Objection</th>
                  <th>One-sentence answer</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>“LiteLLM does everything we need”</td>
                  <td>
                    LiteLLM had a supply-chain compromise and has no Flywheel, no persistent memory, and no Virtual
                    Gateway fabric — see <Link href={pv.replaceLitellm}>Replacing LiteLLM…</Link> and{' '}
                    <Link href={pv.miniShaiHulud}>Mini Shai-Hulud</Link>.
                  </td>
                </tr>
                <tr>
                  <td>“We use Palantir”</td>
                  <td>
                    Palantir asks you to trust a black box. ClawQL asks you to verify WORM, Cosign, and your own VG
                    audit boundary — see <Link href={site.urls.enterpriseGtm}>Enterprise GTM</Link>.
                  </td>
                </tr>
                <tr>
                  <td>“OpenRouter is simpler”</td>
                  <td>
                    OpenRouter is a routing layer with zero governance path. ClawQL is the Foundational Platform —
                    memory, WORM, Flywheel, fabric.
                  </td>
                </tr>
                <tr>
                  <td>“We’ll build this on LiteLLM”</td>
                  <td>
                    You can build a proxy. You cannot ship Flywheel + Dedicated VG + NATS swarm + Edge fleet as a
                    package in any reasonable timeframe.
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h2 id="why-nobody-else">Why nobody else can run this playbook</h2>
          <p>
            The expansion ladder works because ClawQL’s stack is genuinely integrated. Each layer feeds the next. Trying
            to replicate this with point solutions fails at every transition.
          </p>
          <ul>
            <li>
              <strong>Inference → Memory:</strong> Every other inference gateway is stateless. ClawQL’s
              ObservedInferenceGateway writes every call to the call store and the memory vault is available at the same
              endpoint. The transition is one flag.
            </li>
            <li>
              <strong>Memory → Documents:</strong> Persistent memory that uses an Obsidian vault with wikilinks is
              already a semantic knowledge graph. The IDP pipeline ingests documents into the same Onyx search layer
              that <code>memory_recall</code> queries. Activating the IDP plugin bundle is the transition — the
              infrastructure is already there.
            </li>
            <li>
              <strong>Documents → VDR:</strong> Ingested, classified, extracted, and indexed documents can be
              distributed via ConeShare with engagement analytics, dynamic watermarking, and x402 micropayment gating.
              No VDR vendor can add inference, memory, and document processing. ClawQL adds VDR to its existing
              pipeline.
            </li>
            <li>
              <strong>Any layer → Payments:</strong> <code>clawql-payments</code> can gate tool calls, APIs, documents,
              or VDR links behind Stripe, x402, MPP, ACP, or AP2. Payment is integrated at the MCP layer via the
              McpProxyPipeline (X402EnforcementService, EntitlementService, AuditService).
            </li>
          </ul>

          <h3>Competitive table — upsell from inference</h3>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Upsell from inference</th>
                  <th>OpenRouter</th>
                  <th>LiteLLM</th>
                  <th>Portkey</th>
                  <th>Helicone</th>
                  <th>ClawQL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Persistent memory</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Document processing (IDP)</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Virtual Data Room</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Per-tenant Virtual Gateway</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>WORM audit trail</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Fine-tuning flywheel</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Agentic payment rails</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>MCP server (same binary)</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Kernel-level agent sandbox</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Sovereign LLM fleet</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓ (IDP tiers)</td>
                </tr>
                <tr>
                  <td>Supply chain verification</td>
                  <td>✗</td>
                  <td>✗ (March 2026)</td>
                  <td>✗</td>
                  <td>✗</td>
                  <td>✓</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>
          <p>
            None of them can upsell to any of these. ClawQL can upsell to all of them because they’re all part of the
            same integrated stack.
          </p>

          <h2 id="pricing">The pricing model reinforces the strategy</h2>
          <ul>
            <li>
              <strong>Self-hosted (Apache 2.0, free forever):</strong> Full feature set, no license fee — evaluation
              path for engineers and data-sovereignty buyers who will never use managed SaaS.
            </li>
            <li>
              <strong>Developer ($29/mo):</strong> Inference gateway + vault memory. The land-and-expand entry tier —
              priced so procurement friction never blocks a technical evaluation.
            </li>
            <li>
              <strong>Teams ($99/mo):</strong> Inference + vault memory + Onyx semantic search. Five users. Still below
              executor.sh’s Team tier ($150/mo) while including persistent memory and semantic search that executor.sh
              doesn’t have at any price.
            </li>
            <li>
              <strong>Starter / Business / Professional ($299 / $599 / $1,200/mo):</strong> IDP plugin bundle activates
              — documents, VDR, sovereign inference. The expansion ladder completes.
            </li>
          </ul>
          <Callout>
            One MCP endpoint on every tier. Upgrade from Developer to Teams to Starter — the URL doesn’t change, the
            auth token doesn’t change, the vault history doesn’t change. There is no migration. The upsell is
            frictionless because it’s an upgrade, not a replacement.
          </Callout>

          <h2 id="segments">Target segments through the inference-first lens</h2>

          <h3>Segment 1: Developers currently on LiteLLM</h3>
          <p>
            <strong>Entry trigger:</strong> The March 2026 supply chain compromise. LiteLLM’s Python dependency tree
            produced a compromised binary. Teams running LiteLLM in production CI/CD were exposed to credential
            harvesting.
          </p>
          <p>
            <strong>Migration pitch:</strong> Zero code changes. TypeScript-native. Cosign-signed. SBOM per build.
            Arweave-permanent manifest. Startup hash verification via <code>clawql doctor --smoke</code>. The supply
            chain posture is architectural, not claimed.
          </p>
          <p>
            <strong>Expansion:</strong> LiteLLM users are typically more technically sophisticated. They’ll find the
            Flywheel faster, want the Virtual Gateway sooner, and understand the WORM audit trail without needing it
            explained.
          </p>
          <p>
            <strong>Entry:</strong> <code>export OPENAI_BASE_URL=http://localhost:8080/v1</code> — existing LiteLLM
            configuration maps to ClawQL environment variables.
          </p>

          <h3>Segment 2: Developers currently on OpenRouter</h3>
          <p>
            <strong>Entry trigger:</strong> Cost and control. OpenRouter is convenient but provides no pre-inference
            budget enforcement, no audit trail, no memory, and no path to training proprietary models.
          </p>
          <p>
            <strong>Migration pitch:</strong> Same model access pattern (OpenRouter’s 100+ provider breadth is broader
            today — acknowledged; ClawQL’s plugin API closes this over time). ClawQL adds what OpenRouter can’t:
            pre-inference budget caps, WORM call store, semantic cache, PAL routing, memory vault, and the Flywheel. The{' '}
            <code>clawql inference spend --group-by team</code> report is often the first value delivered.
          </p>
          <p>
            <strong>Expansion:</strong> Individual developers and small teams grow into Teams when they want shared
            memory, then Starter when they start processing documents.
          </p>
          <p>
            <strong>Entry:</strong> Same <code>OPENAI_BASE_URL</code> swap. OpenRouter API keys continue to work as
            upstream credentials.
          </p>

          <h3>Segment 3: MCP-first developers (Cursor / Claude Code)</h3>
          <p>
            <strong>Entry trigger:</strong> They want their AI coding assistant to access private or local APIs without
            sending those tools’ specs to a third party.
          </p>
          <p>
            <strong>Pitch:</strong> ClawQL’s Edge Agentic Gateway is a locally hosted MCP server with memory, audit, and
            governance built in. <code>clawql inference serve --port 8080</code> and add{' '}
            <code>http://localhost:8080/mcp</code> to Cursor’s MCP settings.
          </p>
          <p>
            <strong>Expansion:</strong> MCP-first users discover inference routing when they want cost controls on model
            calls their IDE is making. They discover the IDP when they want agents to read documents. Switching from
            “MCP only” to “MCP + inference” is enabling a feature, not installing new software.
          </p>
          <p>
            <strong>Entry:</strong> Self-hosted is free. Managed Developer tier is $29/mo.
          </p>

          <h3>Segment 4: Teams replacing executor.sh</h3>
          <p>
            <strong>Entry trigger:</strong> Execution caps. executor.sh’s Team tier ($150/mo) caps at 250,000
            executions/month and charges $0.20/1,000 overage. Heavy agent usage means watching a meter.
          </p>
          <p>
            <strong>Migration pitch:</strong> ClawQL Teams ($99/mo) has unlimited executions, no caps, no overage, and
            costs less — plus persistent vault memory, Onyx semantic search, and 12-layer token efficiency that
            compounds savings executor.sh cannot offer at any price.
          </p>
          <p>
            <strong>Expansion:</strong> Start by paying less for what you have. End up with a platform executor.sh can
            never be — memory, documents, then VDR.
          </p>
          <p>
            <strong>Entry:</strong> <code>clawql mcp-config --write cursor</code> updates Cursor MCP config.{' '}
            <code>clawql claude</code> / <code>clawql codex</code> / <code>clawql cursor</code> /{' '}
            <code>clawql opencode</code> launch harnesses with ClawQL MCP pre-wired. One command.
          </p>

          <h3>Segment 5: Enterprise inference buyers (post-Palantir evaluation)</h3>
          <p>
            <strong>Entry trigger:</strong> The enterprise evaluated Palantir AIP and found it too expensive, too
            locked-in, or too opaque — or they’ve been using Palantir and want the transparent, auditable alternative.
          </p>
          <p>
            <strong>Pitch:</strong> ClawQL Inference + Virtual Gateway is the governance-first inference layer with
            multi-tenant policy enforcement, audit trail requirements, and data sovereignty — with open, verifiable,
            independently auditable controls instead of proprietary black-box assurances. Detail lives in the{' '}
            <Link href={site.urls.enterpriseGtm}>Enterprise GTM playbook</Link>.
          </p>
          <p>
            <strong>Expansion:</strong> Enterprise buyers move faster through the ladder because they have documented
            requirements at each tier. The Virtual Gateway conversation is often immediate.
          </p>
          <p>
            <strong>Entry:</strong> 90-day structured pilot with success metrics. Inference observability in Phase 1.
            Virtual Gateway governance in Phase 2. IDP and full platform in Phase 3.
          </p>

          <h2 id="moat">The competitive moat at each expansion stage</h2>
          <p>
            Each stage deepens switching cost in a way competitors can’t replicate without rebuilding their entire
            stack.
          </p>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Switching cost</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Inference only</td>
                  <td>Low</td>
                  <td>
                    Any gateway offers <code>OPENAI_BASE_URL</code> compatibility; call store + spend report help but
                    are recreatable
                  </td>
                </tr>
                <tr>
                  <td>Semantic cache + PAL</td>
                  <td>Low–medium</td>
                  <td>Savings are visible and real; mechanism is still recreatable</td>
                </tr>
                <tr>
                  <td>First Flywheel cycle</td>
                  <td>Real</td>
                  <td>Custom fine-tuned Frugal model in tier-map trained on production data — the model is the moat</td>
                </tr>
                <tr>
                  <td>Memory vault adoption</td>
                  <td>Significant</td>
                  <td>
                    Months of institutional knowledge in Obsidian; no other inference gateway has a memory layer to
                    migrate to
                  </td>
                </tr>
                <tr>
                  <td>IDP activation</td>
                  <td>Very high</td>
                  <td>
                    Documents indexed in Onyx, correlated with the call store via <code>correlation_id</code>, linked to
                    WORM; VDR links embedded in customer workflows
                  </td>
                </tr>
                <tr>
                  <td>Virtual Gateway deployment</td>
                  <td>Extremely high</td>
                  <td>
                    EnterpriseGovernance manifests, WORM sinks, and per-tenant audit trails become organizational —
                    compliance evidence, not just tech debt
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>
          <p>
            The inference gateway is the entry. Each subsequent layer deepens the relationship until switching becomes
            functionally impossible for any rational buyer.
          </p>

          <h2 id="inference-optional">The “inference-optional” MCP path</h2>
          <p>ClawQL is genuinely useful to developers who never want to route inference through it.</p>
          <p>
            A developer who uses Claude Code as their IDE agent but has a fleet of private internal APIs has a problem
            today: MCP servers for each API are either manually configured or don’t exist. ClawQL’s Virtual Gateway as a
            locally hosted MCP server solves this without requiring the developer to change their inference provider at
            all. Claude Code connects to <code>http://localhost:8080/mcp</code>. ClawQL exposes every configured API as
            MCP tools — with memory, audit, and governance — while Anthropic remains the model provider.
          </p>
          <p>
            This developer is in the ClawQL ecosystem without paying for inference. When they want inference routing,
            the Flywheel, or document processing, they’re already connected. When their team grows and needs isolation,
            the Virtual Gateway architecture scales.
          </p>
          <Callout>
            The inference-optional path means ClawQL competes in a segment nobody else owns: the governed local MCP
            server market — memory-enabled, audit-trailed, supply-chain-verified, with a clear upgrade path to a full
            platform.
          </Callout>

          <h2 id="execution">GTM execution plan</h2>

          <h3>Phase 1: Developer acquisition (months 1–6)</h3>
          <p>
            <strong>Goal:</strong> 1,000 active inference gateway installs · 200 active MCP server installs · 100 paid
            Developer tier conversions.
          </p>
          <ul>
            <li>
              Content on <Link href={pv.origin}>PragmaticVectors.com</Link> — use the{' '}
              <Link href="#security-dossier">Hardened Security Dossier</Link> as the funnel map: LiteLLM migration +
              twelve-layer cost posts for Inference Gateway buyers; Seatbelt / Tetragon / sandbox posts for Edge Gateway
              adopters (<Link href={pv.series}>Hardened Agentic Stack</Link>)
            </li>
            <li>
              Anchor tweet: drop-in OpenAI replacement, semantic cache, PAL routing, Flywheel, virtual keys, plus{' '}
              <code>/mcp</code> for Cursor — everything else additive
            </li>
            <li>
              LiteLLM migration guide: <Link href={pv.replaceLitellm}>Replacing LiteLLM…</Link> — switch in five
              minutes, zero code changes, better supply chain posture, fine-tuning loop the current setup can’t close
            </li>
            <li>
              executor.sh comparison: factual, not aggressive — tools + inference + memory + documents + policies, no
              per-execution meter
            </li>
          </ul>
          <p>
            <strong>Metrics:</strong> GitHub stars · npm downloads for <code>clawql-inference</code> · 14-day trial
            starts · Week-1 retention (first value moment reached)
          </p>

          <h3>Phase 2: Expansion revenue (months 6–12)</h3>
          <p>
            <strong>Goal:</strong> 50 Teams tier conversions · 10 Starter IDP conversions · first Enterprise pilot.
          </p>
          <ul>
            <li>Flywheel case study — cost and quality impact of the first fine-tuning cycle</li>
            <li>Dedicated Virtual Gateway + Agentic Fabric webinar for platform engineering leads</li>
            <li>
              Welcome sequence for Regional Hub → Dedicated VG upgrades: assign{' '}
              <Link href={pv.zeroTrustIngest}>Zero-Trust Ingest</Link> and{' '}
              <Link href={pv.anomalousToolUse}>Anomalous Tool Use</Link> as foundational reading for the team’s new
              security posture
            </li>
            <li>
              IDP upsell sequence when a user runs <code>clawql sources add &lt;url&gt;</code> against a document store
            </li>
          </ul>
          <p>
            <strong>Metrics:</strong> Developer → Teams (&gt;15%) · Teams → Starter (&gt;8%) · Flywheel adoption ·
            MCP-entry users who add inference routing
          </p>

          <h3>Phase 3: Enterprise and platform (months 12–24)</h3>
          <p>
            <strong>Goal:</strong> 3 Enterprise pilots · 1 signed Enterprise contract · Dedicated Virtual Gateway (Layer
            2) as the primary enterprise entry point, with Regional Hubs remaining the billing/routing plane.
          </p>
          <ul>
            <li>
              Enterprise inference brief for CTOs — Zero-Trust Agentic Fabric (Regional Hubs → Dedicated VG → Edge
              swarm), WORM, EnterpriseGovernance, Palantir comparison (
              <Link href={site.urls.enterpriseGtm}>Enterprise GTM</Link>)
            </li>
            <li>
              Dedicated VG pilots with NATS JetStream + Valkey swarm demos — parallel problem-solving and CTO/CISO
              org-task broadcasts
            </li>
            <li>Compliance vertical push — HIPAA, GDPR, SOC 2 Type II; FedRAMP Moderate on roadmap</li>
            <li>System integrator partnership — white-label and reseller for healthcare, finance, and defense</li>
          </ul>
          <p>
            <strong>Metrics:</strong> Pilot starts · contract conversion · ACV · NRR target &gt;110% · Edge fleet
            adoption in pilots
          </p>

          <h3>Phase 4: Edge swarm at scale (months 18–36)</h3>
          <p>
            <strong>Goal:</strong> Fleet Edge Gateways across customer engineering orgs; federated multi-VG meshes where
            sovereignty requires them; swarm workflows as the default for org-wide agentic tasks.
          </p>
          <ul>
            <li>
              Edge Gateway packaging for developer laptops — mTLS identity pinning, policy push, audit-bundle sync
            </li>
            <li>
              Federated mesh playbooks — peer Virtual Gateways, local WORM, mesh observability without raw
              centralization
            </li>
            <li>Marketplace and payment-rail distribution on top of the fabric</li>
          </ul>
          <p>
            <strong>Metrics:</strong> Edge nodes per Enterprise account · swarm task completion rate · multi-VG
            federation deals
          </p>

          <h2 id="positioning">One-sentence positioning for each entry point</h2>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Positioning</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Inference gateway</td>
                  <td>
                    Stop paying for opaque tokens — the ClawQL Agentic Gateway routes traffic to the optimal model,
                    caches semantically similar requests, and converts your production traffic into a verified,
                    fine-tuned model that gains value every month.
                  </td>
                </tr>
                <tr>
                  <td>MCP server</td>
                  <td>
                    The Foundational Platform for your IDE — one Agentic Gateway gives Cursor and Claude Code governed
                    access to every private API you own, with persistent memory, full audit trails, and a clear path to
                    production-grade governance.
                  </td>
                </tr>
                <tr>
                  <td>executor.sh replacement</td>
                  <td>
                    Everything executor.sh provides, plus persistent memory, semantic search, 12-layer token efficiency,
                    and a zero-meter execution model — providing a lower total cost of ownership for production agents.
                  </td>
                </tr>
                <tr>
                  <td>LiteLLM migration</td>
                  <td>
                    Zero code changes, superior supply chain posture, and a fine-tuning Flywheel that turns your
                    production logs into proprietary model assets.
                  </td>
                </tr>
                <tr>
                  <td>Enterprise</td>
                  <td>
                    The Foundational Platform for Auditable Production AI — Regional Hubs for routing and billing,
                    Dedicated Virtual Gateways as Audit-Trail Enforcement Points with NATS/Valkey swarm coordination,
                    and Edge Gateways on every laptop so CISOs get WORM-verified control of the entire agentic fabric.
                  </td>
                </tr>
                <tr>
                  <td>CISO</td>
                  <td>
                    Verify us, don’t trust us — every agent decision in the WORM log, every policy in the
                    EnterpriseGovernance manifest, Cosign-signed releases, and the audit trail lives in your VG
                    boundary.
                  </td>
                </tr>
                <tr>
                  <td>CTO</td>
                  <td>
                    The Agentic Fabric turns your engineering org into a governed swarm — publish a mandate from the VG;
                    every Edge Gateway pulls it, executes, and reports back with a non-repudiable trail.
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>
          <Callout>
            Vision line for executive briefings: Most AI platforms are individual tools. ClawQL is the operating system
            the tools run on — Auditable Production AI at organizational scale.
          </Callout>

          <h2 id="summary">Summary: the Agentic Gateway as Foundational Platform</h2>
          <p>
            ClawQL is not an inference gateway that happens to have an MCP server, or an MCP server that happens to have
            an inference gateway. It is an <strong>Agentic Gateway</strong> — the Foundational Platform for Auditable
            Production AI, delivered as a Zero-Trust Agentic Fabric. One binary speaks both HTTP/REST for inference and
            MCP for IDE-native tool access, with memory, audit, payments, and governance integrated at the transport
            layer — then scales across Regional Hubs, Dedicated Virtual Gateways, and Edge swarm nodes.
          </p>
          <p>
            Developers start on multi-tenant Regional Hubs. Enterprises graduate to Dedicated Virtual Gateways —
            isolated policy, WORM, and NATS JetStream + Valkey for event-driven swarm intelligence — while usage and
            billing still flow through the Regional plane. Edge Gateways on every laptop make the fabric a distributed
            agentic operating system: offline-first locally, online-governed through mTLS sync. The same architecture,
            the same upgrade path — from three-minute install to regulated production swarm.
          </p>
          <Callout>Start with three minutes. End with Auditable Production AI on a Zero-Trust Agentic Fabric.</Callout>

          <p className="mt-10 text-xs text-mist-500">
            July 2026 · ClawQL ·{' '}
            <Link href="https://docs.clawql.com/inference/clawql-inference" className="text-mist-500">
              docs.clawql.com/inference
            </Link>
            {' · '}
            <Link href={site.urls.pricing} className="text-mist-500">
              Pricing
            </Link>
            {' · '}
            <Link href={site.urls.signup} className="text-mist-500">
              Free trial
            </Link>
            {' · '}
            <Link href={`${site.urls.docs}/getting-started`} className="text-mist-500">
              Self-host
            </Link>
          </p>
        </Document>
      </div>
    </Section>
  )
}
