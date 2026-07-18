import { Document } from '@/components/elements/document'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { site } from '@/lib/site'

import type { ReactNode } from 'react'

const toc = [
  { href: '#executive-summary', label: 'Executive summary' },
  { href: '#two-entry-points', label: 'The two entry points' },
  { href: '#expansion-ladder', label: 'The expansion ladder' },
  { href: '#why-nobody-else', label: 'Why nobody else can run this' },
  { href: '#pricing', label: 'Pricing reinforces the strategy' },
  { href: '#segments', label: 'Target segments' },
  { href: '#moat', label: 'Moat at each stage' },
  { href: '#inference-optional', label: 'Inference-optional MCP path' },
  { href: '#execution', label: 'GTM execution plan' },
  { href: '#positioning', label: 'One-sentence positioning' },
] as const

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
            This playbook defines ClawQL’s <strong>default</strong> go-to-market motion: lead with the Unified Gateway —
            OpenAI-compatible inference plus a locally hosted MCP server — then expand product-led into memory,
            documents, VDR, payments, and sovereign Virtual Gateway governance. For the secondary enterprise /
            Palantir-facing motion, see the <Link href={site.urls.enterpriseGtm}>Enterprise GTM playbook</Link>.
          </p>

          <div className="not-prose my-8 grid gap-4 sm:grid-cols-2">
            {[
              {
                label: 'Primary positioning',
                value: 'Inference is the razor',
                sub: 'Everything else is the blade — expand from three minutes of install',
              },
              {
                label: 'Entry binary',
                value: 'Unified Gateway',
                sub: '/v1 chat completions and /mcp from one process',
              },
              {
                label: 'Core GTM motion',
                value: 'Product-led expansion',
                sub: 'Inference or MCP → cache → PAL → Flywheel → memory → VG → IDP',
              },
              {
                label: 'First paid tier',
                value: 'Developer · $29/mo',
                sub: 'Inference gateway + vault memory; self-host remains free forever',
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
            ClawQL’s previous GTM motion led with the full platform — IDP, VDR, sovereign inference, DAOS coordination —
            and asked buyers to evaluate a comprehensive system before experiencing any of it. This playbook documents
            the corrected motion.
          </p>
          <Callout>The inference gateway is the razor. Everything else is the blade.</Callout>
          <p>
            <code>npx clawql-inference</code> and <code>export OPENAI_BASE_URL=http://localhost:8080</code> are the
            lowest-friction entry points in the stack. A developer can be running ClawQL in three minutes without
            knowing anything about the IDP, the VDR, the Virtual Gateway, or the DAOS architecture. That three-minute
            install is the beginning of a product-led expansion path that ends with a fully sovereign agent operating
            system.
          </p>
          <p>
            The second strategic insight: the Virtual Gateway exposes not just an inference API but an <code>/mcp</code>{' '}
            endpoint. This makes the gateway simultaneously an OpenAI-compatible inference proxy <strong>and</strong> a
            locally hosted MCP server that Cursor, Claude Code, and Codex connect to natively. Users who don’t need
            inference at all can connect their IDE directly to ClawQL’s tool catalog, memory vault, and document
            pipeline through the MCP protocol. Two entry points from one binary.
          </p>

          <h3>The architecture question nobody else can answer</h3>
          <p>How many inference gateways also have:</p>
          <ul>
            <li>A Virtual Gateway architecture for per-tenant policy enforcement and isolated audit trails?</li>
            <li>Built-in persistent cross-session memory — not session memory — that survives restarts?</li>
            <li>
              A document processing pipeline (IDP) that feeds the same semantic search layer the inference gateway
              queries?
            </li>
            <li>
              A fine-tuning flywheel that turns every production inference call into training data for a model that
              becomes cheaper over time?
            </li>
            <li>
              Native agentic payment rails (Stripe + x402 + MPP + ACP + AP2) so the gateway itself can monetize the
              tools it exposes?
            </li>
            <li>A supply chain posture that survived March 2026?</li>
          </ul>
          <p>
            The answer is zero. The inference gateway is the entry point. The platform is what makes it worth staying.
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
            The Virtual Gateway exposes <code>/mcp</code> alongside <code>/v1/chat/completions</code>. The IDE connects
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
            This is the original MCP-first deployment plan, now unified with the inference gateway. The same binary
            handles both. The self-hosted virtual gateway <em>is</em> the locally hosted MCP server. They are not two
            separate products — they are two protocols exposed by one gateway.
          </p>
          <Callout>
            A developer who starts with the MCP entry point and never routes inference through ClawQL is still building
            habits, muscle memory, and dependency on ClawQL’s tool catalog and memory vault. When they want to add
            inference routing, token efficiency, or the fine-tuning flywheel, they’re already inside the ecosystem.
          </Callout>

          <h2 id="expansion-ladder">The expansion ladder</h2>
          <p>
            Every ClawQL user starts on one of the two entry points. The expansion path is product-led — each feature
            creates the natural motivation for the next one. No sales motion required until the Virtual Gateway
            conversation.
          </p>

          <h3>Week 1: The first value moment</h3>
          <p>
            <strong>Inference entry:</strong> Developer runs <code>clawql inference spend --group-by team</code>. For
            the first time they can see which calls are expensive, which models are being used, and what the cost
            attribution looks like per team. This report is often surprising — and hard to generate from OpenRouter or
            LiteLLM without significant custom instrumentation.
          </p>
          <p>
            <strong>MCP entry:</strong> Developer runs <code>memory_recall</code> for the first time and retrieves
            context from a session three weeks ago. The agent remembers what decisions were made, what was tried, what
            failed. They realize they’ve been paying the “what were we doing?” tax on every session and it just
            disappeared.
          </p>
          <p>
            In both cases, the value is immediate and concrete. No onboarding. No training. No integration work beyond
            the initial setup.
          </p>

          <h3>Week 2: Semantic cache + cost visibility</h3>
          <p>
            Enable semantic cache (<code>CLAWQL_INFERENCE_SEMANTIC_CACHE=1</code>). Cache hits start appearing in the
            call store. Cost drops measurably on repeated similar requests. The call store now shows{' '}
            <code>cache_hit: true</code> on a growing fraction of calls.
          </p>
          <p>
            This is the first moment where ClawQL demonstrably costs less than the alternative — not as a theoretical
            efficiency claim but as a visible line item in the spend report.
          </p>

          <h3>Week 3: PAL model escalation</h3>
          <p>
            Enable routing (<code>CLAWQL_INFERENCE_ROUTING_ENABLED=1</code>). Decomposed sub-tasks start routing to
            Frugal tier (local Ollama or Phi-4). Top-level orchestration stays on Standard. Frontier only fires on
            genuine escalation.
          </p>
          <p>
            The bill drops again. The call store shows tier distribution: what fraction of calls resolved at Frugal,
            Standard, or Frontier. The developer can see exactly where their AI spend is going and why.
          </p>

          <h3>Month 2: The flywheel begins</h3>
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
            it automatically for matching task types. The bill drops again — and this time the model on the Frugal tier
            is more accurate than the generic model it replaced, because it was trained on this developer’s actual
            production traces.
          </p>
          <Callout>
            This is the moment that creates lock-in — not contractual lock-in, value lock-in. The custom Frugal model
            lives in ClawQL’s tier-map. Moving to a different inference gateway means giving up that model and starting
            training-data accumulation from scratch.
          </Callout>

          <h3>Month 3: Memory across sessions</h3>
          <p>
            The developer enables persistent memory across their team. <code>memory_ingest</code> starts capturing
            architectural decisions, debugging context, and runbook notes. <code>memory_recall</code> retrieves them in
            new sessions without anyone having to paste context.
          </p>
          <p>
            This is available on the Developer tier ($29/mo) but it changes how the team works. Context that was
            previously lost between sessions now persists. Agents stop asking “what were we doing?” and start asking
            “what happened since last time?”
          </p>

          <h3>Month 4–6: Team isolation and governance</h3>
          <p>
            The team grows. Different projects need different policies. The developer wants per-project audit trails,
            per-team budget caps, and isolation between workloads. This is the Virtual Gateway conversation.
          </p>
          <p>
            Per-team virtual keys with USD budget caps are already available (
            <code>clawql inference keys create --team engineering --budget 500</code>). The Virtual Gateway per-tenant
            architecture is the natural upgrade for teams that need strict isolation — their own policy enforcement
            point, their own WORM sink, their own audit trail.
          </p>
          <p>
            This is when the first real sales conversation happens — not to sell ClawQL (the developer is already sold)
            but to scope deployment model, SLA, and managed hosted vs self-hosted Virtual Gateway in their VPC.
          </p>

          <h3>Month 6+: IDP and document pipeline</h3>
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
              <strong>Developer ($29/mo):</strong> Inference gateway + vault memory. The “razor” tier — cheap enough
              that cost is never the reason not to try it.
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
            <strong>Pitch:</strong> ClawQL’s Virtual Gateway is a locally hosted MCP server with memory, audit, and
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
              Content on PragmaticVectors.com — sandbox, LiteLLM supply chain, twelve-layer token efficiency, and
              agentic payment rails posts as direct funnels to the inference gateway
            </li>
            <li>
              Anchor tweet: drop-in OpenAI replacement, semantic cache, PAL routing, Flywheel, virtual keys, plus{' '}
              <code>/mcp</code> for Cursor — everything else additive
            </li>
            <li>
              LiteLLM migration guide: switch in five minutes, zero code changes, better supply chain posture,
              fine-tuning loop the current setup can’t close
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
            <li>Virtual Gateway webinar for platform engineering leads</li>
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
            <strong>Goal:</strong> 3 Enterprise pilots · 1 signed Enterprise contract · Virtual Gateway as the primary
            enterprise entry point.
          </p>
          <ul>
            <li>
              Enterprise inference brief for CTOs — Virtual Gateway, WORM, EnterpriseGovernance, Palantir comparison (
              <Link href={site.urls.enterpriseGtm}>Enterprise GTM</Link>)
            </li>
            <li>Compliance vertical push — HIPAA, GDPR, SOC 2 Type II; FedRAMP Moderate on roadmap</li>
            <li>System integrator partnership — white-label and reseller for healthcare, finance, and defense</li>
          </ul>
          <p>
            <strong>Metrics:</strong> Pilot starts · contract conversion · ACV · NRR target &gt;110%
          </p>

          <h2 id="positioning">One-sentence positioning for each entry point</h2>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Line</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Inference gateway</td>
                  <td>
                    Stop paying for tokens you don’t need — ClawQL routes every call to the cheapest model that can
                    handle it, caches semantically similar requests, and turns your production traffic into a fine-tuned
                    model that gets cheaper every month.
                  </td>
                </tr>
                <tr>
                  <td>MCP server</td>
                  <td>
                    One local gateway that gives Cursor and Claude Code governed access to every private API you own —
                    with persistent memory across sessions, audit trails on every tool call, and a clear upgrade path to
                    inference efficiency and document processing when you’re ready.
                  </td>
                </tr>
                <tr>
                  <td>executor.sh replacement</td>
                  <td>
                    Everything executor.sh does, plus persistent memory, semantic search, 12-layer token efficiency, and
                    no execution meter — for less per month.
                  </td>
                </tr>
                <tr>
                  <td>LiteLLM migration</td>
                  <td>
                    Zero code changes. Better supply chain posture. And the fine-tuning loop that turns your inference
                    logs into a model you own.
                  </td>
                </tr>
                <tr>
                  <td>Enterprise</td>
                  <td>
                    The governed inference layer with per-tenant Virtual Gateways, WORM audit trails, and
                    EnterpriseGovernance manifests — so your CISO can verify what your agents did instead of trusting
                    what your vendor claims.
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h2 id="summary">Summary: the Unified Gateway</h2>
          <p>
            ClawQL is not an inference gateway that happens to have an MCP server, or an MCP server that happens to have
            an inference gateway. It is a <strong>Unified Gateway</strong> — a single binary that speaks both HTTP/REST
            for inference and MCP for IDE-native tool access, with memory, audit, payments, and governance integrated at
            the transport layer.
          </p>
          <p>
            The self-hosted Virtual Gateway is the locally hosted MCP server. The managed hosted Virtual Gateway is the
            per-tenant enterprise policy enforcement layer. The same architecture, the same binary, the same upgrade
            path. Infrastructure-as-a-product that scales with the user’s needs.
          </p>
          <Callout>Start with three minutes. End with a sovereign agent operating system.</Callout>

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
