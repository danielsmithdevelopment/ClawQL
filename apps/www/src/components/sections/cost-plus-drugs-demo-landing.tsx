import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Container } from '@/components/elements/container'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { site } from '@/lib/site'

import './cost-plus-drugs-demo-landing.css'

const GH_EXAMPLE =
  'https://github.com/danielsmithdevelopment/ClawQL/tree/main/docs/examples/cost-plus-drugs-governance'
const CPD_MCP_DOCS = 'https://mccpdc-llc.github.io/pricing-api-documentation/mcp.html'
const CPD_MCP = 'https://mcp.costplusdrugs.com/'

const accomplishments = [
  {
    title: 'Uses their real read MCP',
    body: 'ClawQL federates Cost Plus Drugs’ public pricing MCP unchanged — search, estimates, pharmacy locator. We do not re-pitch a price connector they already shipped.',
  },
  {
    title: 'Governed mock writes',
    body: 'There is no public ordering API. A local mock refill tool parks behind digest-bound human approval so agents cannot place orders themselves.',
  },
  {
    title: 'BAA-aware multi-model routing',
    body: 'Patient fields are redacted before non-BAA providers. Public cash prices still flow; PHI does not leave the gateway without policy.',
  },
  {
    title: 'Token-efficient catalog access',
    body: 'Targeted drug search is ~950× smaller than dumping the full CPD catalog — the gateway prefers compact tools for price questions.',
  },
] as const

const steps = [
  {
    title: 'Discover Cost Plus tools through one gateway',
    body: 'Agents connect to ClawQL, not a pile of point MCP servers. search ranks live CPD operations (pricing, estimates) alongside the mock write surface.',
    result: '15 federated operations indexed from CPD + mock write MCP',
  },
  {
    title: 'Read live cash prices (not medical advice)',
    body: 'execute routes mcp__cost_plus_drugs_pricing__search to their public MCP. Example: atorvastatin 20mg cash pricing for a 30-count fill.',
    result: 'Live price lookup succeeded (~4.5KB structured response)',
  },
  {
    title: 'Prefer compact tools over full-catalog dumps',
    body: 'pricelist_all / pricelist_cpd return multi-megabyte payloads. ClawQL steers agents to search / pricelist_*_search for the same answer.',
    result: '~3.9KB targeted search vs ~3.7MB full CPD catalog (~949×)',
  },
  {
    title: 'Stage a refill — agent cannot self-approve',
    body: 'place_refill_order is policy: mandate. The gateway parks the exact drug, NDC, quantity, and quoted price under a digest-bound execution id.',
    result: 'status: mandate_required · agent self-approve blocked',
  },
  {
    title: 'Human resumes the exact parked order',
    body: 'Only a human (patient/operator) may clawql resume / MCP resume. Args cannot be swapped at approval time. Labeled MOCK — never sent to Cost Plus.',
    result: 'mock order accepted_mock · bound to NDC / qty / price',
  },
  {
    title: 'Everything lands in the audit trail',
    body: 'Price reads, mandate park, and resume finalize append to the MCP audit ring (and can dual-write durable WORM in production).',
    result: 'Hash-chained audit entries for execute + resume',
  },
] as const

export function CostPlusDrugsDemoLanding() {
  return (
    <div className="cpd-demo-page">
      <header className="cpd-demo-hero">
        <Container className="cpd-demo-hero__inner">
          <p className="cpd-demo-motion-brand cpd-demo-brand">ClawQL</p>
          <p className="cpd-demo-motion-kicker cpd-demo-kicker">
            Cost Plus Drugs demo — one governed gateway for multi-LLM pharmacy reads, with patient approval and audit
            before any write.
          </p>
          <p className="cpd-demo-motion-kicker cpd-demo-disclaimer">
            Not medical advice · Mock orders only · Prescription stays with a clinician
          </p>
          <div className="cpd-demo-motion-cta cpd-demo-cta-row">
            <ButtonLink href="#walkthrough" size="lg">
              Watch the walkthrough
            </ButtonLink>
            <PlainButtonLink href="#steps" size="lg">
              See each step
            </PlainButtonLink>
          </div>
        </Container>
      </header>

      <section className="cpd-demo-band py-16" aria-labelledby="cpd-built">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-3xl flex-col gap-3">
            <h2 id="cpd-built" className="font-display text-3xl/9 font-medium tracking-tight text-pretty text-[var(--cpd-ink)]">
              What we built
            </h2>
            <p className="text-pretty text-[var(--cpd-muted)]">
              Cost Plus already exposes a public, unauthenticated MCP for price and availability (
              <Link href={CPD_MCP_DOCS}>their scope page</Link> stops at estimates). The valuable next step — and this
              demo — is safely letting agents <em>stage</em> consequential actions across Claude, ChatGPT, Grok, and the
              rest without giving any model unilateral write power or unrestricted PHI.
            </p>
          </div>
          <ul className="cpd-demo-accomplishments">
            {accomplishments.map((item) => (
              <li key={item.title} className="cpd-demo-accomplishment">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Section
        id="steps"
        eyebrow="End-to-end path"
        headline="Each thing the demo does"
        subheadline="Same sequence as the local gateway smoke: discover → price → compact → mandate → human resume → audit."
      >
        <ol className="cpd-demo-steps">
          {steps.map((step) => (
            <li key={step.title} className="cpd-demo-step">
              <div className="cpd-demo-step__index" aria-hidden="true" />
              <div>
                <h3 className="cpd-demo-step__title">{step.title}</h3>
                <p className="cpd-demo-step__body">{step.body}</p>
                <p className="cpd-demo-result">
                  <span className="cpd-demo-result__label">Result</span>
                  <span className="cpd-demo-result__value">{step.result}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="walkthrough"
        className="cpd-demo-band"
        eyebrow="Screen recording"
        headline="Gateway smoke on camera"
        subheadline="Offline BAA/mandate tests, token compaction, then live ClawQL HTTP MCP over Cost Plus pricing plus a mock refill resume."
      >
        <div className="cpd-demo-media">
          <video
            controls
            playsInline
            preload="metadata"
            poster="/demo/cost-plus-drugs/final-summary.webp"
            aria-label="ClawQL Cost Plus Drugs governance demo walkthrough"
          >
            <source src="/demo/cost-plus-drugs/walkthrough.mp4" type="video/mp4" />
          </video>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-[var(--cpd-muted)]">
          Final frame also available as a still:{' '}
          <Link href="/demo/cost-plus-drugs/final-summary.webp">summary screenshot</Link>.
        </p>
      </Section>

      <Section
        eyebrow="Safety posture"
        headline="What this demo will not do"
        subheadline="Aligned with Cost Plus Drugs’ own MCP scope — and with how you should talk about it publicly."
      >
        <ul className="m-0 flex max-w-2xl list-disc flex-col gap-3 pl-5 text-[var(--cpd-muted)]">
          <li>No clinical, dosing, or substitution advice</li>
          <li>No claim that a real Cost Plus order was placed</li>
          <li>No real patient data — synthetic fields only until BAAs and HIPAA safeguards exist</li>
          <li>No “HIPAA certified” marketing (HIPAA is about safeguards + BAAs, not a product badge)</li>
        </ul>
      </Section>

      <Section
        eyebrow="Run it yourself"
        headline="Reproduce locally"
        subheadline="Example pack lives in the monorepo. Offline smoke needs only Node; the live gateway path needs a built ClawQL checkout and network access to Cost Plus."
      >
        <pre className="cpd-demo-code">{`cd docs/examples/cost-plus-drugs-governance
./scripts/smoke.sh

# Live ClawQL HTTP gateway + CPD MCP + mock write
node scripts/gateway-smoke.mjs`}</pre>
        <p className="mt-4 text-sm text-[var(--cpd-muted)]">
          Source: <Link href={GH_EXAMPLE}>docs/examples/cost-plus-drugs-governance</Link> · Upstream MCP:{' '}
          <Link href={CPD_MCP}>{CPD_MCP}</Link> · Healthcare industry context:{' '}
          <Link href="/industries/healthcare">/industries/healthcare</Link>
        </p>
      </Section>

      <CallToActionSimpleCentered
        headline="Governed agents for pharmacies — and every other regulated vertical"
        subheadline="Self-host free on Apache 2.0, or request early access for managed hosting with the same MCP surface."
        cta={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={site.urls.signup} size="lg">
              Request early access
            </ButtonLink>
            <PlainButtonLink href={site.urls.security} size="lg">
              Security stack
            </PlainButtonLink>
          </div>
        }
      />
    </div>
  )
}
