import { Document } from '@/components/elements/document'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { site } from '@/lib/site'

import type { ReactNode } from 'react'

const toc = [
  { href: '#market-reality', label: 'Part 1 — Market reality' },
  { href: '#honest-positioning', label: 'Part 2 — Honest positioning' },
  { href: '#gtm-motion', label: 'Part 3 — Standalone GTM motion' },
  { href: '#landing-brief', label: 'Part 4 — Landing page brief' },
  { href: '#site-architecture', label: 'Part 5 — Site architecture' },
  { href: '#revenue-motion', label: 'Part 6 — Revenue motion' },
  { href: '#positioning-statement', label: 'Part 7 — Positioning statement' },
] as const

function Callout({ children }: { children: ReactNode }) {
  return <blockquote>{children}</blockquote>
}

function ScrollTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export function IdpGtmPlaybook() {
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
            This playbook defines ClawQL&apos;s <strong>IDP-first</strong> go-to-market motion: a standalone Intelligent
            Document Processing platform for operations, compliance, legal, lending, and M&amp;A buyers — not a feature
            footnote under inference. Default developer motion:{' '}
            <Link href={site.urls.inferenceGtm}>inference-first GTM</Link>. Enterprise / sovereign motion:{' '}
            <Link href={site.urls.enterpriseGtm}>enterprise GTM</Link>. Product ground truth:{' '}
            <Link href={`${site.urls.docs}/vision/idp-platform`}>IDP platform docs</Link>.
          </p>

          <Callout>
            Internal strategy + landing-page brief (July 2026). Do not distribute externally without review. Canonical
            markdown: <code>docs/vision/clawql-idp-gtm.md</code>.
          </Callout>

          <h2 id="market-reality">Part 1 — The market reality that creates the opportunity</h2>
          <p>
            Gartner&apos;s first Magic Quadrant for Intelligent Document Processing (September 2025) named five Leaders
            among 18 vendors. Extraction accuracy has converged (top platforms advertise 90–99% on common formats). The
            traditional moat — &quot;our model is more accurate&quot; — is disappearing. The battleground is{' '}
            <strong>integration depth</strong>, <strong>deployment model</strong>, and <strong>TCO</strong>. ClawQL wins
            all three on verifiable numbers.
          </p>

          <h3>The pricing chasm</h3>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Pricing model</th>
                  <th>Real cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>ABBYY Vantage</td>
                  <td>Per-page, custom quote</td>
                  <td>$0.02–$0.10/page; median enterprise ~$150K/year + $20–$150K implementation</td>
                </tr>
                <tr>
                  <td>Hyperscience</td>
                  <td>Custom quote</td>
                  <td>Up to $1.50/page; $30K–$100K+ to start</td>
                </tr>
                <tr>
                  <td>Kofax TotalAgility</td>
                  <td>Custom quote</td>
                  <td>Mid-five to seven figures annually</td>
                </tr>
                <tr>
                  <td>Rossum</td>
                  <td>Tiered from $18K/year</td>
                  <td>$18K+ entry; SAP/Coupa-focused</td>
                </tr>
                <tr>
                  <td>Intralinks VDR</td>
                  <td>$0.40–$0.85/page</td>
                  <td>$15K–$200K+ per M&amp;A deal</td>
                </tr>
                <tr>
                  <td>Datasite VDR</td>
                  <td>Custom quote</td>
                  <td>Up to $720K/year for large implementations</td>
                </tr>
                <tr>
                  <td>
                    <strong>ClawQL IDP (Starter)</strong>
                  </td>
                  <td>
                    <strong>Flat $299/mo</strong>
                  </td>
                  <td>
                    <strong>$3,588/year. Unlimited documents. VDR included.</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>
          <p>
            A team that would pay $150,000/year for ABBYY pays $3,588/year for ClawQL Starter — for a platform that does
            more, deploys faster, and does not require a dedicated implementation team.
          </p>

          <h3>The integration gap no incumbent fills</h3>
          <p>
            Incumbent IDP stops at extraction and delivery. Cross-referencing institutional knowledge, triggering
            downstream APIs, Merkle-chained archive, and secure counterparty distribution are left for the team to
            build. ClawQL runs ingestion through secure external distribution on one MCP endpoint. That integration is
            structural, not additive.
          </p>

          <h3>Three buyer problems nobody is solving</h3>
          <ol>
            <li>
              <strong>SaaS sprawl tax</strong> — 5–10 disconnected tools (OCR, PDF, DMS, search, VDR) with separate
              billing, compliance postures, and breach surfaces.
            </li>
            <li>
              <strong>Implementation tax</strong> — 3–12 months, dedicated PS teams, $20K–$150K on top of license fees.
            </li>
            <li>
              <strong>Pipeline–VDR gap</strong> — Intralinks/Datasite charge $0.40–$0.85/page with no pipeline;
              documents arrive via manual OCR → redact → archive → upload.
            </li>
          </ol>
          <p>ClawQL closes all three simultaneously.</p>

          <h2 id="honest-positioning">Part 2 — The honest positioning</h2>
          <h3>What ClawQL IDP is</h3>
          <p>
            A sovereign, modular IDP that closes the full document lifecycle in one system:{' '}
            <strong>
              Ingest → Classify → Convert → OCR → Redact → Archive → Semantically index → Distribute securely
            </strong>
            . Self-hosted (Apache 2.0, free forever) or managed hosted (Starter $299/mo). AI agents orchestrate via MCP
            / natural language in Cursor or Claude Code — no custom integration code.
          </p>

          <h3>What ClawQL IDP is not</h3>
          <ul>
            <li>
              <strong>Not</strong> a replacement for ABBYY/Hyperscience at millions-of-documents-per-month scale — those
              buyers may need deeper vertical extraction models.
            </li>
            <li>
              <strong>Not yet FedRAMP authorized</strong> — Tungsten Automation achieved FedRAMP High ATO (March 2026);
              US federal procurement is out of scope today.
            </li>
            <li>
              <strong>Not</strong> a forms-automation RPA platform — ClawQL uses AI agents, not UiPath-style RPA bots.
            </li>
          </ul>

          <h3>Claimable differentiators (now)</h3>
          <ol>
            <li>
              <strong>Most affordable full-pipeline IDP with VDR</strong> — $299/mo, unlimited documents, no per-page
              meter; VDR included.
            </li>
            <li>
              <strong>Only IDP that is also an inference gateway and MCP server</strong> — expand without changing
              endpoint or vendor.
            </li>
            <li>
              <strong>Native MCP from any AI assistant</strong> — full pipeline via natural language.
            </li>
            <li>
              <strong>Merkle audit trail per step</strong> — independently verifiable for regulated industries.
            </li>
            <li>
              <strong>Self-hosted / air-gapped / data-sovereign</strong> — no document data must leave the environment.
            </li>
            <li>
              <strong>Deploy in hours, not months</strong> —{' '}
              <code>helm install clawql charts/clawql-full-stack --namespace clawql</code>.
            </li>
          </ol>
          <Callout>
            Avoid &quot;best IDP on the planet&quot; until earned. Prefer:{' '}
            <em>
              best IDP for teams that need pipeline integration, data sovereignty, agentic access, and price efficiency
            </em>
            .
          </Callout>

          <h2 id="gtm-motion">Part 3 — The standalone IDP GTM motion</h2>
          <p>
            The IDP buyer is often a VP of Ops, Legal Ops Manager, transaction coordinator, controller, or compliance
            officer — not a developer optimizing PAL routing. Lead with documents, cost, auditability, and time-to-value
            in their language.
          </p>

          <h3>Entry points</h3>
          <ol>
            <li>
              <strong>SaaS replacement</strong> — one system vs 5–10 tools ($500–$5,000/mo current spend).
            </li>
            <li>
              <strong>VDR cost</strong> — unlimited VDRs in $299/mo vs $0.40–$0.85/page.
            </li>
            <li>
              <strong>Compliance</strong> — cryptographic proof of how a document was processed.
            </li>
            <li>
              <strong>Integration</strong> — extract → knowledge → APIs → archive → distribute from one NL instruction.
            </li>
          </ol>

          <h3>Expansion ladder (documents → platform)</h3>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Horizon</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Day one</td>
                  <td>Full pipeline operational (Helm or hosted trial)</td>
                </tr>
                <tr>
                  <td>Week 2</td>
                  <td>
                    Semantic cross-reference via <code>knowledge_search_onyx</code>
                  </td>
                </tr>
                <tr>
                  <td>Month 2</td>
                  <td>
                    HITL for low-confidence extractions (<code>hitl_enqueue_label_studio</code>)
                  </td>
                </tr>
                <tr>
                  <td>Month 3</td>
                  <td>MCP from AI assistants for natural-language ops</td>
                </tr>
                <tr>
                  <td>Month 4+</td>
                  <td>Inference + memory discovered on the same platform</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Competitive table (sales)</h3>
          <ScrollTable>
            <table>
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>ABBYY</th>
                  <th>Hyperscience</th>
                  <th>Rossum</th>
                  <th>Intralinks</th>
                  <th>ClawQL IDP</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Entry price</td>
                  <td>$15K+/yr est</td>
                  <td>$30K+/yr est</td>
                  <td>$18K/yr</td>
                  <td>$10K+/yr</td>
                  <td>
                    <strong>$3,588/yr</strong>
                  </td>
                </tr>
                <tr>
                  <td>Per-doc meter</td>
                  <td>Yes</td>
                  <td>Yes</td>
                  <td>Yes</td>
                  <td>Yes</td>
                  <td>
                    <strong>No</strong>
                  </td>
                </tr>
                <tr>
                  <td>Implementation</td>
                  <td>Weeks–months</td>
                  <td>3–12 months</td>
                  <td>Weeks–months</td>
                  <td>Days</td>
                  <td>
                    <strong>Hours</strong>
                  </td>
                </tr>
                <tr>
                  <td>Self-hosted</td>
                  <td>Partial</td>
                  <td>Partial</td>
                  <td>No</td>
                  <td>No</td>
                  <td>
                    <strong>Yes (free)</strong>
                  </td>
                </tr>
                <tr>
                  <td>VDR included</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>VDR only</td>
                  <td>
                    <strong>Yes</strong>
                  </td>
                </tr>
                <tr>
                  <td>Pipeline</td>
                  <td>Extract + handoff</td>
                  <td>Extract + handoff</td>
                  <td>Extract + handoff</td>
                  <td>Distribute only</td>
                  <td>
                    <strong>Full lifecycle</strong>
                  </td>
                </tr>
                <tr>
                  <td>MCP-native</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>
                    <strong>Yes</strong>
                  </td>
                </tr>
                <tr>
                  <td>Merkle audit</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>
                    <strong>Yes</strong>
                  </td>
                </tr>
                <tr>
                  <td>Inference gateway</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>No</td>
                  <td>
                    <strong>Same binary</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>

          <h3>Objection handlers (short)</h3>
          <ul>
            <li>
              <strong>Gartner MQ vendor:</strong> MQ validated the category; evaluate on your docs, timeline, TCO, and
              whether the IDP stops at extraction.
            </li>
            <li>
              <strong>Millions of docs/month:</strong> be honest — Hyperscience/Tungsten may fit; ClawQL targets
              hundreds→tens of thousands/month with pipeline + sovereignty + cost.
            </li>
            <li>
              <strong>FedRAMP:</strong> we do not have it; say so before evaluation.
            </li>
            <li>
              <strong>Setup complexity:</strong> one Helm chart vs months of PS.
            </li>
            <li>
              <strong>Already run Stirling/Paperless/Nextcloud:</strong> ClawQL is the orchestration + MCP + VDR loop on
              top.
            </li>
          </ul>

          <h2 id="landing-brief">Part 4 — clawql.com/idp landing page brief</h2>
          <p>
            Convert an IDP buyer who has never heard of ClawQL. Answer &quot;Is this the document platform I&apos;ve
            been looking for?&quot; in ~10 seconds; trial/demo in ~60. Do <strong>not</strong> lead with PAL, Flywheel,
            WORM, or developer framing.
          </p>

          <h3>Above the fold (test both headlines)</h3>
          <ul>
            <li>
              <strong>A:</strong> Document processing that doesn&apos;t stop at extraction.
            </li>
            <li>
              <strong>B:</strong> Your IDP costs $150,000/year. Ours costs $299/month. And it does more.
            </li>
          </ul>
          <p>
            Subhead: full lifecycle (ingest → distribute) in one system, AI-agent orchestrated, price incumbents cannot
            match. CTAs: Start free trial · Deploy self-hosted. Trust: Apache 2.0 · 1,000+ formats · hours not months ·
            Merkle per step.
          </p>

          <h3>Build sections</h3>
          <ol>
            <li>Pipeline visual (Intake → Convert → Process → Archive → Distribute)</li>
            <li>Price comparison table (hard numbers)</li>
            <li>Three things your current IDP can&apos;t do (cross-ref · VDR loop · crypto proof)</li>
            <li>Five-minute setup (Helm + NL example + hosted trial)</li>
            <li>Supported document types by industry</li>
            <li>
              Vertical callouts (Lending · Legal/M&amp;A · Real estate) →{' '}
              <Link href={`${site.urls.docs}/plugins`}>plugins / verticals</Link>
            </li>
            <li>Security cards (air-gap · Merkle · Stirling redaction · Istio mTLS)</li>
            <li>Pricing expanded + Starter callout</li>
            <li>Footer CTAs by buyer type</li>
          </ol>
          <p>
            Implement the public marketing page at <code>/idp</code> when ready; this playbook is the strategy source of
            truth at <code>/idp/gtm</code>.
          </p>

          <h2 id="site-architecture">Part 5 — Site architecture</h2>
          <p>
            <strong>Recommendation: section of clawql.com, not a separate microsite</strong> — shared SEO, pricing,
            docs, and trial; natural expansion into the broader platform.
          </p>
          <pre>
            <code>{`clawql.com/inference  → inference-first (developers)
clawql.com/idp        → IDP-first (ops / compliance)
clawql.com/enterprise → sovereign / CISO-CTO motion`}</code>
          </pre>

          <h2 id="revenue-motion">Part 6 — IDP-first as its own revenue motion</h2>
          <p>
            Inference-first is PLG. IDP-first often hits budget owners already spending on SaaS — a cleaner
            &quot;replace my stack&quot; sale. Starter converters are budget-approved, problem-aware, and warm leads for
            Business / Professional and eventually inference + memory.
          </p>
          <Callout>
            ClawQL IDP is not &quot;the document plugin for ClawQL.&quot; It is a standalone IDP that competes with
            ABBYY, Hyperscience, and Intralinks — and wins on price, speed, pipeline integration, and agentic access.
          </Callout>
          <p>
            Funnel: PragmaticVectors essays → <code>clawql.com/idp</code> → docs. Planned essays: &quot;The $150,000
            Invoice&quot; and &quot;The Per-Page Trap.&quot;
          </p>

          <h2 id="positioning-statement">Part 7 — Positioning statement (one paragraph)</h2>
          <Callout>
            ClawQL is the Intelligent Document Processing platform that closes the full document lifecycle — ingest,
            convert, OCR, redact, archive, semantic search, and secure distribution — in a single system, orchestrated
            by AI agents, with a cryptographic audit trail at every step. It deploys in hours, starts at $299/month
            (versus $15,000–$150,000+ for ABBYY or Hyperscience), includes unlimited VDRs (versus $0.40–$0.85 per page
            for Intralinks), and is available self-hosted for free. It is the only IDP platform that is also a native
            MCP server — meaning any AI assistant that supports MCP can operate the full pipeline via natural language,
            without custom integration code. For teams in lending, legal, real estate, healthcare, or M&amp;A who need
            document intelligence without a six-figure contract, a six-month implementation, or a per-page surprise on
            every invoice.
          </Callout>

          <p className="mt-10 text-xs text-mist-500">
            July 2026 · ClawQL IDP GTM ·{' '}
            <Link href={`${site.urls.docs}/vision/idp-platform`} className="text-mist-500">
              IDP platform docs
            </Link>{' '}
            ·{' '}
            <Link href={site.urls.inferenceGtm} className="text-mist-500">
              Inference GTM
            </Link>
          </p>
        </Document>
      </div>
    </Section>
  )
}
