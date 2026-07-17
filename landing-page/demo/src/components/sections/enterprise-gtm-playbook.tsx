import { Document } from '@/components/elements/document'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'

import type { ReactNode } from 'react'

const toc = [
  { href: '#executive-summary', label: 'Executive summary' },
  { href: '#strategic-context', label: 'Part I — Strategic context' },
  { href: '#architecture', label: 'Part II — Architecture' },
  { href: '#product-suite', label: 'Part III — Product suite' },
  { href: '#competitive-edge', label: 'Part IV — Competitive edge' },
  { href: '#gtm-strategy', label: 'Part V — GTM by segment' },
  { href: '#audience-playbooks', label: 'Part VI — Audience playbooks' },
  { href: '#inference-gtm', label: 'Part VII — Inference GTM' },
  { href: '#idp-gtm', label: 'Part VIII — IDP GTM' },
  { href: '#pitch-deck', label: 'Part IX — Pitch deck outline' },
] as const

function Callout({ children }: { children: ReactNode }) {
  return <blockquote>{children}</blockquote>
}

function ScrollTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export function EnterpriseGtmPlaybook() {
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
            This playbook defines ClawQL’s go-to-market strategy against Palantir AIP and the broader enterprise AI
            infrastructure market. It is written for three buyer types — CISOs and risk officers, CTOs and platform
            engineering VPs, and FinOps leads — with a unified <strong>sovereign alternative</strong> narrative.
          </p>

          <div className="not-prose my-8 grid gap-4 sm:grid-cols-2">
            {[
              {
                label: 'Primary positioning',
                value: 'Sovereign alternative',
                sub: 'Agentic transparency over black-box enterprise AI',
              },
              {
                label: 'Target markets',
                value: 'Defense · Health · Finance · Energy',
                sub: 'Regulated mid-market, roughly $20M–$500M revenue',
              },
              {
                label: 'Core GTM motion',
                value: '3-phase adoption',
                sub: 'Observe → Govern → Sovereignty',
              },
              {
                label: 'Token cost reduction',
                value: '30–50%+',
                sub: 'Via the efficiency stack and Intelligence Flywheel',
              },
            ].map((item) => (
              <div key={item.label} className="border-t border-mist-200 pt-3 dark:border-white/15">
                <p className="text-xs font-semibold tracking-wide text-mist-500 uppercase">{item.label}</p>
                <p className="mt-1 text-base font-semibold text-mist-950 dark:text-white">{item.value}</p>
                <p className="mt-1 text-xs text-mist-500">{item.sub}</p>
              </div>
            ))}
          </div>

          <h2 id="executive-summary">Executive summary</h2>
          <p>
            ClawQL does not try to out-Palantir Palantir. Palantir has decades of enterprise data integration,
            government contracts, and a proprietary Ontology that took years to build. The path is not replication. It
            is offering what they structurally cannot: mathematical verifiability, open auditability,
            infrastructure-agnostic deployment, and a closed-loop Intelligence Flywheel that turns inference spend into
            proprietary model capital.
          </p>

          <h3>One-sentence positioning</h3>
          <Callout>
            ClawQL is the sovereign AI operating system for enterprises that want autonomous agents — but need to
            verify, not trust, everything they do.
          </Callout>

          <h3>Three product vectors</h3>
          <p>Each can be sold standalone. Each feeds the others:</p>
          <ul>
            <li>
              <strong>ClawQL Inference</strong> — the inference firewall. Pre-inference budget enforcement, multi-layer
              token efficiency, model escalation, semantic caching, WORM forensic audit, and the Intelligence Flywheel.
            </li>
            <li>
              <strong>ClawQL IDP</strong> — the foundation. Golden Paths for agents, hardened stacks, self-service
              provisioning, cognitive-load reduction for platform teams, and governance baked into CI/CD via the policy
              manifest.
            </li>
            <li>
              <strong>Sovereign agentic infrastructure</strong> — the operating system. Multi-agent coordination with
              NSV/SGDOP diversity measurement, Enterprise Ontology, kinetic execution with atomic guardrails, agent
              lifecycle management, and Virtual Gateway delegated sovereignty.
            </li>
          </ul>

          <h2 id="strategic-context">Part I — Strategic context</h2>
          <h3>The AI governance deadlock</h3>
          <p>
            Enterprise AI adoption is caught between two needs. Engineering wants agentic velocity — agents that execute
            multi-step workflows across APIs, documents, and systems without human intervention at every step. Security
            and compliance want verifiable control — proof that agents stay inside authorized boundaries, handle PII
            correctly, remain auditable, and survive a SOC 2 Type II review.
          </p>
          <p>
            The market’s usual answer is: pick one. Palantir offers control with vendor lock-in, opacity, and long
            implementations. OpenRouter and LiteLLM offer velocity without enterprise governance. ClawQL’s answer is
            both: autonomous agents with mathematically verifiable safety, open auditability, and
            infrastructure-agnostic deployment.
          </p>

          <h3>Three pillars of enterprise AI failure</h3>
          <h4>1. Governance vacuum</h4>
          <ul>
            <li>Shadow AI — personal API keys wiring production data to public LLM endpoints</li>
            <li>Unredacted PII flowing to external models</li>
            <li>Unknown model provenance — no cryptographic proof of which model processed which data</li>
            <li>Prompt injection from attacker-controlled documents, email, and external content</li>
          </ul>
          <h4>2. Economic leakage</h4>
          <ul>
            <li>Token sprawl — Frontier models used for work cheaper local models could handle</li>
            <li>Budget controls that only appear as post-facto dashboards</li>
            <li>Point optimizations that never compound as a platform</li>
            <li>No data ownership — every call is a sunk cost, not training capital</li>
          </ul>
          <h4>3. Observability black boxes</h4>
          <ul>
            <li>Generic errors instead of forensic decision chains</li>
            <li>Audit trails for engineers, not regulators</li>
            <li>No rollback when an autonomous agent takes a wrong action</li>
            <li>APM that sees HTTP, not reasoning chains, tool calls, or authorizing policy</li>
          </ul>

          <h3>Palantir AIP — strengths and structural weaknesses</h3>
          <p>
            Palantir is the incumbent in regulated industries. Honest positioning starts with acknowledging what they do
            well.
          </p>
          <h4>Where Palantir wins</h4>
          <ul>
            <li>
              <strong>Ontology</strong> — typed enterprise objects with relationships and provenance; agents ground in
              business reality, not JSON blobs
            </li>
            <li>
              <strong>Apollo</strong> — continuous delivery into air-gapped, classified, edge, and sovereign
              environments
            </li>
            <li>
              <strong>Kinetic execution</strong> — agents write to ERP/CRM/MES with hardened transaction paths
            </li>
            <li>
              <strong>Government presence</strong> — decades of trust in the most regulated environments on earth
            </li>
          </ul>
          <h4>Where Palantir is structurally weak</h4>
          <ul>
            <li>Proprietary black box — Ontology is not portable or independently verifiable</li>
            <li>High-touch implementation — multi-month onboarding and professional services</li>
            <li>Vendor lock-in — Ontology, deployment, and tooling are all proprietary</li>
            <li>“Trust us” governance — track record instead of open cryptographic proof</li>
            <li>Opaque pricing — mid-market buyers often cannot get a clear cost structure</li>
          </ul>

          <h3>The winning move: agentic transparency</h3>
          <Callout>
            Do not build a better Palantir. Build the most transparent and auditable agentic infrastructure. Palantir
            says “trust us because we are the standard.” ClawQL says “verify us because we are the infrastructure.”
          </Callout>
          <p>
            The category is not “cheaper Palantir” or “open-source Palantir.” It is an infrastructure layer that
            provides autonomous agent capability with mathematical proof of what agents did, why, and which policy
            authorized each action — verified by the WORM audit trail, not asserted by the vendor.
          </p>

          <h2 id="architecture">Part II — Architectural foundation</h2>
          <h3>The 8-layer acyclic graph</h3>
          <p>
            ClawQL’s platform is an eight-layer acyclic model with policy-as-code governance via a Merkle-anchored
            universal manifest. Every component traces back to the manifest’s Merkle root. No component trusts a value
            that cannot be verified against that root.
          </p>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Component</th>
                  <th>Enterprise relevance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1 — Orchestration</td>
                  <td>Unified Helm charts</td>
                  <td>Reproducible deploy across air-gapped, cloud, and edge (EKS, GKE, K3s)</td>
                </tr>
                <tr>
                  <td>2 — Infrastructure</td>
                  <td>Arweave + IPFS + Cosign + SBOM</td>
                  <td>Immutable, content-addressed artifacts with signed images and startup integrity checks</td>
                </tr>
                <tr>
                  <td>3 — Gateway</td>
                  <td>clawql-api + MCP + ATRClaims</td>
                  <td>Zero-trust MCP gateway; role/purpose/scope validated before action; 2PC for high-impact work</td>
                </tr>
                <tr>
                  <td>4 — Memory</td>
                  <td>Vault + Onyx + graphs</td>
                  <td>Persistent memory, hybrid recall, team sync, versioned Enterprise Ontology</td>
                </tr>
                <tr>
                  <td>5 — Compute</td>
                  <td>Rift + clawql-inference + vLLM</td>
                  <td>
                    Isolated build envs; escalation, cache, fallbacks; sovereign fleets inside the tenant boundary
                  </td>
                </tr>
                <tr>
                  <td>6 — Observability</td>
                  <td>LGTM+ + WORM + Langfuse</td>
                  <td>Immutable Merkle-chained audit; LLM traces; correlation from intent to WORM entry</td>
                </tr>
                <tr>
                  <td>7 — Coordination</td>
                  <td>clawql-ouroboros + NSV/SGDOP</td>
                  <td>Swarm coordination with measurable diversity, reputation, and Diversity Dividends</td>
                </tr>
                <tr>
                  <td>8 — Interface</td>
                  <td>CLI + Desktop + payments + Virtual Gateway</td>
                  <td>Developer portals, policy CLI, payment rails, per-tenant delegated sovereignty</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Virtual Gateway — delegated sovereignty</h3>
          <p>
            The Virtual Gateway decouples the global routing substrate (efficiency and model routing) from per-tenant
            policy enforcement (sovereignty and compliance), so one platform can serve radically different security
            requirements.
          </p>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Role</th>
                  <th>Where it runs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Global routing substrate</td>
                  <td>Model-agnostic execution, optimization, HA throughput. Knows nothing about tenant policy.</td>
                  <td>ClawQL-managed infrastructure</td>
                </tr>
                <tr>
                  <td>Virtual Gateway</td>
                  <td>Resolves tenant manifest, PII redaction, keys, kinetic guardrails, local routing</td>
                  <td>Customer VPC, enclave, or on-prem — unless the customer chooses managed</td>
                </tr>
                <tr>
                  <td>Inference providers</td>
                  <td>Actual model execution — local vLLM, on-prem, or frontier APIs per policy</td>
                  <td>Customer-controlled for sovereign tiers; ClawQL-managed for Developer/Teams</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h4>Sovereign handshake (summary)</h4>
          <ul>
            <li>
              <strong>Transport:</strong> mTLS with SPIFFE/SPIRE identities — machine identity, not just a bearer token
            </li>
            <li>
              <strong>Governance sync:</strong> gateway sends local manifest hash; mismatch → degraded mode + audit
              event
            </li>
            <li>
              <strong>Pull pattern:</strong> gateway initiates outbound; no inbound port into the tenant VPC
            </li>
            <li>
              <strong>Kill switch:</strong> lost heartbeats or invalid manifest stop routing to that endpoint
            </li>
          </ul>

          <h4>BYOG — bring your own gateway</h4>
          <p>
            Absolute sovereignty buyers host their own Virtual Gateway container. ClawQL manages the global substrate.
            The customer retains cryptographic keys and policy enforcement. Inference is processed under customer policy
            before leaving their perimeter.
          </p>
          <Callout>
            Objection: “We can’t use your SaaS because of data sovereignty.” Response: with BYOG, payload stays in your
            VPC unless your manifest allows otherwise. We manage routing intelligence; you manage keys and policy. The
            WORM trail lets you verify what happened.
          </Callout>

          <h3>Policy-as-code — the ClawQL manifest</h3>
          <p>
            The manifest is an enforceable enterprise governance contract: it travels with every deployment, is signed
            independently of the binary, and can be validated by admission controllers and auditors without access to
            ClawQL’s internals.
          </p>
          <ul>
            <li>
              <code>complianceLevel</code> — SOC2_TYPE2, HIPAA, GDPR, FEDRAMP_MODERATE
            </li>
            <li>
              <code>dataResidency</code> — routing constraints for cross-border flows
            </li>
            <li>
              <code>piiHandling</code> — MASKED / BLOCKED / ALLOWED before LLM calls
            </li>
            <li>
              <code>auditAttribution</code> — identity required; sink forced to WORM, not optional logging
            </li>
            <li>
              <code>kineticGuardrails</code> — human-in-the-loop, transaction limits, rollback protocol
            </li>
            <li>
              <code>delegatedGovernance</code> — Virtual Gateway enforcement point, tenant WORM sink, local model
              endpoint
            </li>
          </ul>
          <p>
            CLI surface includes <code>clawql-release lint</code>, <code>publish</code>, <code>verify</code>, and{' '}
            <code>clawql doctor --smoke</code> for startup hash verification against the signed manifest.
          </p>

          <h2 id="product-suite">Part III — Product suite</h2>
          <h3>Product 1 — ClawQL Inference (inference firewall)</h3>
          <p>
            A standalone OpenAI-compatible gateway competitive with LiteLLM — built as a governance-first control plane,
            not only a routing proxy. Clients that work with OpenAI work with ClawQL Inference via an{' '}
            <code>OPENAI_BASE_URL</code> swap.
          </p>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Layers</th>
                  <th>Mechanism</th>
                  <th>Cost impact</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Structural efficiency</td>
                  <td>1–4</td>
                  <td>Code Mode (search + execute), GraphQL trimming, terse output, cache_control prefixes</td>
                  <td>Large input reduction on Layer 1; 2–4 compound</td>
                </tr>
                <tr>
                  <td>Smart inference</td>
                  <td>5–8</td>
                  <td>Semantic cache, history distillation, prompt dedupe, Frugal→Standard→Frontier escalation</td>
                  <td>Cache hits skip calls; routine work stays off Frontier</td>
                </tr>
                <tr>
                  <td>Continuous optimization</td>
                  <td>9–12</td>
                  <td>Structured-output hints, budgets, prefill, Intelligence Flywheel</td>
                  <td>Compounding — Frugal tier improves over time</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h4>Model escalation</h4>
          <ul>
            <li>
              <strong>Frugal</strong> — local Ollama or fine-tuned smaller models
            </li>
            <li>
              <strong>Standard</strong> — primary cloud model for top-level orchestration
            </li>
            <li>
              <strong>Frontier</strong> — highest capability; escalated only on genuine failure or drift
            </li>
            <li>One notch per retry; never skip tiers. Drift can trigger agent coordination instead of escalation.</li>
            <li>Every decision WORM-logged with failure signal, tier, cost delta, and correlation id</li>
          </ul>

          <h4>Intelligence Flywheel</h4>
          <p>
            Capture → filter (verdict) → scrub (Presidio + WORM provenance) → train → register into Frugal tier. Each
            cycle makes the cheap tier more accurate. The economic shift is from pure OPEX API spend toward CAPEX —
            proprietary model assets that grow with production traffic.
          </p>

          <h3>Product 2 — ClawQL IDP (the foundation)</h3>
          <p>
            Sold to platform engineering and CTOs drowning in infra tickets. The pitch is flow-state engineering, not
            “more AI tools.”
          </p>
          <ul>
            <li>Golden Path templates with CI/CD, admission policy, observability, and WORM hooks</li>
            <li>
              Self-service provisioning — <code>clawql onboard --interactive</code>
            </li>
            <li>Manifest-driven CI/CD — no publish without a valid governance block</li>
            <li>Agent lifecycle management — policy, weights, and ontology as an immutable unit</li>
            <li>Single pane against agent sprawl — what is deployed, under which policy, in what compliance state</li>
          </ul>
          <p>
            Versus Palantir Apollo: open EnterpriseGovernance schema, Cosign-signed images, Arweave-anchored artifacts,
            standard Kubernetes/Helm, independently verifiable WORM — without Apollo’s proprietary package format.
          </p>

          <h3>Product 3 — Sovereign agentic infrastructure</h3>
          <h4>Enterprise Ontology primitive</h4>
          <ul>
            <li>Version-controlled entity/relationship schema in the manifest</li>
            <li>Typed memory recall for entity-specific context</li>
            <li>MCP tool generation from schema with PEP validation</li>
            <li>Schema migrations as signed, auditable manifest events</li>
          </ul>
          <h4>Kinetic execution layer</h4>
          <ul>
            <li>Transaction sandbox before external writes (Salesforce, SAP, ServiceNow, custom APIs)</li>
            <li>Atomic multi-step writes with rollback</li>
            <li>Blast-radius caps (region, tenant, dollar amounts)</li>
            <li>WORM entry for every staged, approved, executed, or rolled-back kinetic event</li>
          </ul>
          <h4>Agent coordination — NSV and SGDOP</h4>
          <p>
            Normalized Semantic Variance detects ensemble convergence. Semantic GDOP identifies which direction in
            embedding space is under-covered so recruitment is targeted, not random. The math is publishable and
            independently computable.
          </p>
          <p className="text-xs text-mist-500">
            Credit: PAL framing from JQ Lee / Q00/ouroboros; NSV/SGDOP design iterations with independent ensemble
            validation references in the broader research community.
          </p>

          <h2 id="competitive-edge">Part IV — Competitive edge</h2>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Palantir AIP</th>
                  <th>OpenRouter</th>
                  <th>LiteLLM</th>
                  <th>ClawQL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Philosophy</td>
                  <td>Integrated enterprise data OS</td>
                  <td>Zero-ops model access</td>
                  <td>DIY inference proxy</td>
                  <td>Sovereign AI OS; governance-as-code</td>
                </tr>
                <tr>
                  <td>Governance</td>
                  <td>Internal / opaque</td>
                  <td>None</td>
                  <td>User-managed</td>
                  <td>Policy-as-code manifest; admission-ready</td>
                </tr>
                <tr>
                  <td>Audit</td>
                  <td>Internal logs</td>
                  <td>None</td>
                  <td>Limited callbacks</td>
                  <td>WORM Merkle chain; independently verifiable</td>
                </tr>
                <tr>
                  <td>Sovereignty</td>
                  <td>Platform-locked</td>
                  <td>SaaS-only</td>
                  <td>Self-host burden</td>
                  <td>Virtual Gateway / BYOG; federated WORM sinks</td>
                </tr>
                <tr>
                  <td>Supply chain</td>
                  <td>Proprietary</td>
                  <td>Opaque</td>
                  <td>Python dependency risk</td>
                  <td>Cosign, SBOM, Layer 0 manifest, startup verify</td>
                </tr>
                <tr>
                  <td>Data ownership</td>
                  <td>Limited export story</td>
                  <td>Vendor retains usage</td>
                  <td>Proxy only</td>
                  <td>Flywheel exports → your models</td>
                </tr>
                <tr>
                  <td>Setup</td>
                  <td>Multi-month</td>
                  <td>Minutes</td>
                  <td>Hours–days</td>
                  <td>Minutes to self-serve trial; expand by phase</td>
                </tr>
                <tr>
                  <td>Lock-in</td>
                  <td>Very high</td>
                  <td>None</td>
                  <td>Low</td>
                  <td>None — open schema, K8s, Apache 2.0 core</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Positioning one-liners</h3>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Competitor</th>
                  <th>Their claim</th>
                  <th>ClawQL response</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Palantir AIP</td>
                  <td>“Trust us — we built this for the DoD.”</td>
                  <td>“Verify us. Decisions in WORM. Policy in the manifest. Models signed.”</td>
                </tr>
                <tr>
                  <td>OpenRouter</td>
                  <td>“Zero-ops access to 100+ models.”</td>
                  <td>“Same model access with a governance layer that actually exists.”</td>
                </tr>
                <tr>
                  <td>LiteLLM</td>
                  <td>“Build your own gateway in Python.”</td>
                  <td>“We remove the DIY burden and close the fine-tuning loop your logs create.”</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h2 id="gtm-strategy">Part V — GTM strategy by segment</h2>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Buyer</th>
                  <th>Primary pain</th>
                  <th>Entry</th>
                  <th>Expansion</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Regulated mid-market</td>
                  <td>CISO + CTO</td>
                  <td>Compliance blocking AI; shadow AI; no regulator-ready trail</td>
                  <td>Inference + Virtual Gateway + WORM</td>
                  <td>Ontology → kinetic → full platform</td>
                </tr>
                <tr>
                  <td>Defense / government</td>
                  <td>CTO + program manager</td>
                  <td>Air-gap; sovereignty; SaaS not approved</td>
                  <td>Self-hosted Helm / Packer images</td>
                  <td>ALM → classified → FedRAMP track</td>
                </tr>
                <tr>
                  <td>Platform engineering</td>
                  <td>VP Eng + platform lead</td>
                  <td>Agent sprawl; infra ticket backlog</td>
                  <td>IDP Golden Paths + onboarding</td>
                  <td>Inference → Virtual Gateway → platform</td>
                </tr>
                <tr>
                  <td>AI innovation teams</td>
                  <td>AI/ML VP</td>
                  <td>Cost without visibility; no routing intelligence</td>
                  <td>
                    Standalone inference (<code>npx</code> + base URL)
                  </td>
                  <td>IDP → Virtual Gateway → platform</td>
                </tr>
                <tr>
                  <td>LiteLLM migration</td>
                  <td>Platform eng</td>
                  <td>Supply-chain / dependency risk; no governance</td>
                  <td>Drop-in migration; observe then enforce</td>
                  <td>Escalation → Flywheel → Virtual Gateway</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Three-phase adoption</h3>
          <h4>Phase 1 — Observation (0–90 days)</h4>
          <ul>
            <li>
              Deploy clawql-inference as <code>OPENAI_BASE_URL</code> drop-in
            </li>
            <li>Populate call store + WORM; spend by team within 24 hours</li>
            <li>Optional sandbox init for coding-agent workstations</li>
            <li>Virtual Gateway in observation mode for shadow AI mapping</li>
            <li>Exit deliverable: 90-day AI usage report with WORM provenance</li>
          </ul>
          <h4>Phase 2 — Governance (90–270 days)</h4>
          <ul>
            <li>Publish EnterpriseGovernance manifests; Cosign-signed policy blocks</li>
            <li>Enable PII redaction; kinetic guardrails; AP2 mandates where needed</li>
            <li>First Flywheel cycle from verdict-filtered, scrubbed exports</li>
            <li>Flight Recorder for non-technical compliance readers</li>
            <li>Exit deliverable: SOC 2–ready trail, PII-clean pipeline, first Frugal fine-tune</li>
          </ul>
          <h4>Phase 3 — Sovereignty (270+ days)</h4>
          <ul>
            <li>Enterprise Ontology + generated MCP tools</li>
            <li>Kinetic execution for ERP/CRM/MES writes</li>
            <li>ALM controller for immutable agent deployment units</li>
            <li>Repeated Flywheel cycles and domain adapters</li>
            <li>Exit deliverable: sovereign OS on customer-controlled infrastructure</li>
          </ul>

          <h2 id="audience-playbooks">Part VI — Audience-specific playbooks</h2>
          <h3>CISO / risk officer</h3>
          <p>Anchor every conversation: “verify us, don’t trust us.”</p>
          <h4>Discovery questions</h4>
          <ul>
            <li>Where is PII today when developers use AI assistants or automation?</li>
            <li>If a regulator asked for every AI decision in 12 months, how long would that take?</li>
            <li>Is the agent allow/deny boundary enforced in policy or only in application code?</li>
            <li>Have you audited inference dependencies after recent supply-chain incidents?</li>
          </ul>
          <h4>Objection handlers</h4>
          <ul>
            <li>
              <strong>On-prem only:</strong> Virtual Gateway / BYOG keeps payload in your perimeter; substrate routes
              intelligence, not your keys.
            </li>
            <li>
              <strong>Prompt logging fear:</strong> federated WORM sinks can point at customer storage; receipts stay
              yours.
            </li>
            <li>
              <strong>FedRAMP:</strong> architecture targets Moderate controls; WORM + Cosign support SOC 2 Type II
              evidence today while certification remains on the roadmap.
            </li>
            <li>
              <strong>Supply chain:</strong> Cosign, SBOM, Arweave Layer 0, <code>clawql doctor --smoke</code> on
              startup.
            </li>
            <li>
              <strong>Kinetic risk:</strong> manifest guardrails, AP2 mandates, blast-radius caps, staged review,
              rollback protocol.
            </li>
          </ul>

          <h3>CTO / platform engineering VP</h3>
          <p>Conversation centers on cognitive load and agent sprawl.</p>
          <ul>
            <li>How many AI scripts/agents run in prod, and who owns each?</li>
            <li>How long does connecting a new agent to a production system take?</li>
            <li>How many places change when you swap models for cost or quality?</li>
            <li>Do you know which team is driving this month’s inference growth?</li>
          </ul>
          <p>
            Differentiation: compounding efficiency layers, Flywheel as a technical asset, Effect-TS typed failure
            modes, one MCP endpoint so upgrades are config — not migrations.
          </p>

          <h3>Finance / FinOps</h3>
          <Callout>
            Most AI cost management is a dashboard after money is spent. ClawQL is a budget that fires before tokens are
            generated.
          </Callout>
          <ul>
            <li>Virtual-key USD budgets with hard HTTP 429 at the gateway</li>
            <li>
              <code>clawql inference spend --group-by team</code> for chargeback-ready attribution
            </li>
            <li>Escalation ROI measurable from tier distribution in the call store</li>
            <li>Flywheel trend: more Frugal resolution, fewer Frontier escalations over time</li>
          </ul>

          <h2 id="inference-gtm">Part VII — ClawQL Inference standalone GTM</h2>
          <p>
            Position as the inference firewall for CTOs, CISOs, and FinOps — not only a convenience proxy for individual
            developers.
          </p>
          <h3>Shadow IT capture motion</h3>
          <p>
            Deploy in observation mode with zero application changes. Within 30 days you have a complete map of model,
            team, data, and cost — the business case for Phase 2 governance. For LiteLLM migrations: same base URL
            pattern, stronger supply-chain story, and a fine-tuning loop the current setup usually cannot close.
          </p>

          <h2 id="idp-gtm">Part VIII — ClawQL IDP standalone GTM</h2>
          <p>
            IDP is a platform strategy sale (VP Eng / platform lead), not only an engineering infrastructure swap. Pain
            is agent sprawl and lead time for new agent services — not token bills alone.
          </p>
          <Callout>
            ClawQL IDP is not a replacement for Backstage or Crossplane. It is the agentic governance layer around them:
            Backstage catalogs services; ClawQL governs what agents built on those services are allowed to do.
          </Callout>

          <h2 id="pitch-deck">Part IX — Enterprise pitch deck outline</h2>
          <p>Modular ~28-slide outline for a 25–30 minute enterprise pitch. Reorder by audience.</p>
          <ol>
            <li>
              <strong>Context (1–5):</strong> title, thesis, governance deadlock, three failure pillars, honest Palantir
              comparison
            </li>
            <li>
              <strong>Architecture (6–11):</strong> 8-layer graph, Virtual Gateway, manifest, kinetic layer, Ontology,
              NSV/SGDOP
            </li>
            <li>
              <strong>Products (12–17):</strong> three-product flywheel, Inference, Intelligence Flywheel, IDP,
              sovereign OS, multi-environment lifecycle
            </li>
            <li>
              <strong>Economics (18–22):</strong> competitive matrix, sovereignty win, FinOps ROI, risk ROI, data moat
            </li>
            <li>
              <strong>Adoption (23–28):</strong> three phases, segments, packaging, roadmap, vision, next steps (trial /
              workshop / 90-day pilot)
            </li>
          </ol>

          <h3>Suggested next steps</h3>
          <ul>
            <li>
              <strong>Option A:</strong> 14-day Developer trial — <code>npx clawql-inference</code> + base URL swap
            </li>
            <li>
              <strong>Option B:</strong> 2-hour technical workshop with platform engineering
            </li>
            <li>
              <strong>Option C:</strong> 90-day pilot with success metrics agreed up front
            </li>
          </ul>

          <p className="mt-10 text-xs text-mist-500">
            July 2026 · ClawQL ·{' '}
            <Link href="https://docs.clawql.com" className="text-mist-500">
              docs.clawql.com
            </Link>
          </p>
        </Document>
      </div>
    </Section>
  )
}
