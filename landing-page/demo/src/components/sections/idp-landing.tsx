import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CheckmarkIcon } from '@/components/icons/checkmark-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { pricing } from '@/lib/pricing'
import { site } from '@/lib/site'

const pipelineStages = [
  {
    name: 'Intake',
    stack: 'Nextcloud / Email',
    detail: 'Uploads land in a watched inbox — WebDAV, email, or API — ready for agents.',
  },
  {
    name: 'Convert',
    stack: 'Gotenberg · Tika',
    detail: 'Office, HTML, and 1,000+ formats normalize to processable PDFs and text.',
  },
  {
    name: 'Process',
    stack: 'Stirling · OCR',
    detail: 'Classify, extract, OCR, and redact PII before anything hits the archive.',
  },
  {
    name: 'Archive',
    stack: 'Onyx search',
    detail: 'Indexed for hybrid semantic search — agents cite source documents, not guesses.',
  },
  {
    name: 'Distribute',
    stack: 'ConeShare VDR',
    detail: 'Trackable rooms, watermarks, and engagement analytics.',
  },
] as const

const priceRows = [
  {
    vendor: 'ABBYY Vantage',
    model: 'Per-page, custom quote',
    cost: '$0.02–$0.10/page · median enterprise ~$150K/year + implementation',
    highlight: false,
  },
  {
    vendor: 'Hyperscience',
    model: 'Custom quote',
    cost: 'Up to $1.50/page · $30K–$100K+ to start',
    highlight: false,
  },
  {
    vendor: 'Intralinks / Datasite',
    model: '$0.40–$0.85/page (VDR)',
    cost: '$15K–$200K+ per deal · no document pipeline',
    highlight: false,
  },
  {
    vendor: 'ClawQL IDP (Starter)',
    model: `Flat ${pricing.starter.monthlyPrice}/mo`,
    cost: '$3,588/year · unlimited documents · VDR included',
    highlight: true,
  },
] as const

const differentiators = [
  {
    title: 'Cross-reference while you process',
    body: 'Extraction alone is not enough. ClawQL agents can call your CRM, LOS, and APIs mid-pipeline — match a W-2 to the application, flag a missing schedule, update the deal record — without a separate integration project.',
  },
  {
    title: 'Close the VDR loop',
    body: 'Incumbent IDPs stop at the archive. ConeShare VDR is in the same subscription: trackable rooms for counsel, counterparties, and auditors — not a second six-figure contract.',
  },
  {
    title: 'Prove it cryptographically',
    body: 'Every pipeline step writes a Merkle-linked audit trail. Reconstruction is not a spreadsheet exercise — it is a hash chain you can show an examiner.',
  },
] as const

const documentTypes = [
  {
    industry: 'Financial',
    examples: 'W-2, 1040, bank statements, paystubs, closing disclosures',
  },
  {
    industry: 'Legal / M&A',
    examples: 'PSAs, NDAs, diligence packs, board resolutions, redlines',
  },
  {
    industry: 'Real estate',
    examples: 'Title commitments, offers, inspection reports, HOA docs',
  },
  {
    industry: 'Healthcare',
    examples: 'EOBs, referral packets, intake forms (with PII redaction)',
  },
  {
    industry: 'General ops',
    examples: 'Invoices, contracts, IDs, shipping docs, scanned archives',
  },
] as const

const verticals = [
  {
    name: 'Lending',
    href: '/industries/lending',
    body: 'Income docs, appraisal packs, and LOS updates in one agentic loop.',
  },
  {
    name: 'Legal / M&A',
    href: '/industries/legal',
    body: 'Diligence intake, VDR distribution, and searchable deal memory.',
  },
  {
    name: 'Real estate',
    href: '/industries/real-estate',
    body: 'Title and PSA extraction tied back to the transaction record.',
  },
] as const

const securityPoints = [
  {
    title: 'Self-hosted or air-gapped',
    body: 'Apache 2.0 core. Deploy the full IDP stack on your cluster — no forced SaaS data plane.',
  },
  {
    title: 'Merkle audit per step',
    body: 'WORM-style hash chaining across ingest, convert, redact, archive, and share events.',
  },
  {
    title: 'PII redaction in-pipeline',
    body: 'Stirling redaction before archive and search.',
  },
  {
    title: 'Istio mTLS mesh',
    body: 'Service-to-service encryption and egress control for regulated tenants.',
  },
] as const

function TrustAnchors() {
  return (
    <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-mist-600 dark:text-mist-400">
      <li>Apache 2.0 core</li>
      <li aria-hidden className="text-mist-300 dark:text-mist-600">
        ·
      </li>
      <li>1,000+ formats</li>
      <li aria-hidden className="text-mist-300 dark:text-mist-600">
        ·
      </li>
      <li>Deploys in hours</li>
      <li aria-hidden className="text-mist-300 dark:text-mist-600">
        ·
      </li>
      <li>Merkle audit trail per step</li>
    </ul>
  )
}

export function IdpLanding() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={
          <p className="text-sm/7 font-medium text-mist-600 dark:text-mist-300">Intelligent Document Processing</p>
        }
        headline={
          <>
            Your IDP costs $150,000/year.
            <br className="max-sm:hidden" /> Ours costs {pricing.starter.monthlyPrice}/month. And it does more.
          </>
        }
        subheadline={
          <p>
            ClawQL is the document processing platform that closes the full lifecycle — ingest, convert, OCR, redact,
            archive, semantic search, and secure distribution — in a single system, orchestrated by AI agents, at a
            price no incumbent can match.
          </p>
        }
        cta={
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
              <ButtonLink href={site.urls.signup} size="lg">
                Start free trial
              </ButtonLink>
              <PlainButtonLink href={`${site.urls.docs}/deployment/kubernetes`} size="lg">
                Deploy self-hosted <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
            <TrustAnchors />
          </div>
        }
      />

      <Section
        id="pipeline"
        eyebrow="Full lifecycle"
        headline="Document processing that doesn't stop at extraction"
        subheadline={
          <p>
            One pipeline from inbox to VDR. Agents orchestrate every stage over MCP in natural language.
          </p>
        }
      >
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
          {pipelineStages.map((stage, index) => (
            <li
              key={stage.name}
              className="relative flex flex-col gap-2 border-t border-mist-950/10 pt-4 dark:border-white/10"
            >
              <span className="font-mono text-xs tracking-wide text-mist-500 tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="font-display text-lg font-semibold text-mist-950 dark:text-white">{stage.name}</p>
              <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">
                {stage.stack}
              </p>
              <p className="text-sm/6 text-mist-700 dark:text-mist-300">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="pricing-compare"
        eyebrow="Total cost of ownership"
        headline="The pricing chasm is the product"
        subheadline={
          <p>
            Extraction accuracy has converged across vendors. The battleground is deployment speed, pipeline depth, and
            what you actually pay when volume grows. Illustrative benchmarks — verify at procurement.
          </p>
        }
      >
        <div className="overflow-x-auto rounded-xl ring-1 ring-mist-950/10 dark:ring-white/10">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">IDP and VDR pricing comparison</caption>
            <thead className="bg-mist-950/2.5 dark:bg-white/5">
              <tr className="border-b border-mist-950/10 dark:border-white/10">
                <th scope="col" className="px-4 py-3 font-semibold text-mist-950 dark:text-white">
                  Vendor
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-mist-950 dark:text-white">
                  Pricing model
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-mist-950 dark:text-white">
                  Real cost
                </th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((row) => (
                <tr
                  key={row.vendor}
                  className={
                    row.highlight
                      ? 'border-b border-mist-950/10 bg-mist-950/[0.04] last:border-b-0 dark:border-white/10 dark:bg-white/[0.06]'
                      : 'border-b border-mist-950/5 last:border-b-0 dark:border-white/5'
                  }
                >
                  <th
                    scope="row"
                    className={
                      row.highlight
                        ? 'px-4 py-3 font-semibold text-mist-950 dark:text-white'
                        : 'px-4 py-3 font-medium text-mist-800 dark:text-mist-200'
                    }
                  >
                    {row.vendor}
                  </th>
                  <td className="px-4 py-3 text-mist-700 dark:text-mist-300">{row.model}</td>
                  <td
                    className={
                      row.highlight
                        ? 'px-4 py-3 font-medium text-mist-950 dark:text-white'
                        : 'px-4 py-3 text-mist-700 dark:text-mist-300'
                    }
                  >
                    {row.cost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-mist-500">
          Enterprise platforms typically require 3–12 months and dedicated implementation teams. ClawQL: one Helm chart,
          hours.
        </p>
      </Section>

      <Section
        id="differentiators"
        eyebrow="Category break"
        headline="Three things your current IDP can't do"
        subheadline={
          <p>
            Accuracy parity means the next buying criteria are integration depth, closed-loop distribution, and
            auditability you can prove.
          </p>
        }
      >
        <ol className="grid gap-10 md:grid-cols-3">
          {differentiators.map((item, index) => (
            <li key={item.title} className="flex flex-col gap-3">
              <span className="font-mono text-xs tracking-wide text-mist-500 tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-xl font-semibold text-mist-950 dark:text-white">{item.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-300">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="setup"
        eyebrow="Time to value"
        headline="From zero to pipeline in one afternoon"
        subheadline={
          <p>
            Self-host with Helm, or start a 14-day hosted trial — no credit card. Agents drive the stack over MCP; you
            do not write a custom integration layer first.
          </p>
        }
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-wide text-mist-600 uppercase dark:text-mist-400">
              Self-hosted
            </p>
            <pre className="overflow-x-auto rounded-xl bg-mist-950 px-4 py-4 text-sm text-mist-100 dark:bg-black/40">
              <code>{`helm upgrade --install clawql ./charts/clawql-mcp \\
  -n clawql --create-namespace \\
  -f charts/clawql-mcp/values-docker-desktop.yaml`}</code>
            </pre>
            <PlainButtonLink href={`${site.urls.docs}/deployment/kubernetes`}>
              Kubernetes & Helm guide <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-wide text-mist-600 uppercase dark:text-mist-400">
              Natural-language control
            </p>
            <blockquote className="border-l-2 border-mist-950/20 pl-4 text-sm/7 text-mist-800 dark:border-white/20 dark:text-mist-200">
              “Ingest the closing package from Nextcloud, redact SSNs, archive to Onyx, and open a ConeShare room for
              counsel with watermarked PDFs.”
            </blockquote>
            <p className="text-sm/7 text-mist-700 dark:text-mist-300">
              Same MCP endpoint your agents already use — ClawQL is the only IDP that is also a native MCP server. See
              the <Link href={`${site.urls.docs}/providers/idp-pipeline`}>IDP pipeline reference</Link> and{' '}
              <Link href={`${site.urls.docs}/vision/idp-platform`}>IDP platform docs</Link>.
            </p>
            <div>
              <ButtonLink href={site.urls.signup}>Start 14-day trial</ButtonLink>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="document-types"
        eyebrow="Coverage"
        headline="Documents teams actually process"
        subheadline={
          <p>
            Layout-aware OCR and parsers for the formats that slow down ops. Vertical presets compose the same pipeline
            with domain boilerplate.
          </p>
        }
      >
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {documentTypes.map((item) => (
            <li key={item.industry} className="border-t border-mist-950/10 pt-4 dark:border-white/10">
              <p className="font-semibold text-mist-950 dark:text-white">{item.industry}</p>
              <p className="mt-2 text-sm/6 text-mist-700 dark:text-mist-300">{item.examples}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="verticals"
        eyebrow="Industry motions"
        headline="Start where the document pain is loudest"
        subheadline={
          <p>
            Domain verticals are plugin presets — Memory, Documents, and domain{' '}
            <code className="font-mono text-[0.9em]">.cqw</code> workflows — not separate products. Browse the{' '}
            <Link href={`${site.urls.docs}/plugins`}>plugin registry</Link>.
          </p>
        }
      >
        <ul className="grid gap-8 md:grid-cols-3">
          {verticals.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className="group flex flex-col gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mist-950 dark:focus-visible:outline-white"
              >
                <span className="font-display text-xl font-semibold text-mist-950 group-hover:underline dark:text-white">
                  {item.name}
                </span>
                <span className="text-sm/7 text-mist-700 dark:text-mist-300">{item.body}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-mist-950 dark:text-white">
                  Industry page <ArrowNarrowRightIcon />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="security"
        eyebrow="Security & compliance"
        headline="Built for Examiners"
        subheadline={
          <p>
            Sovereignty and auditability are product defaults for IDP tiers — not a separate “enterprise pack” you
            negotiate after the pilot.
          </p>
        }
      >
        <ul className="grid gap-8 sm:grid-cols-2">
          {securityPoints.map((item) => (
            <li key={item.title} className="flex gap-3">
              <CheckmarkIcon aria-hidden className="mt-1 size-5 shrink-0 stroke-mist-950 dark:stroke-white" />
              <div>
                <p className="font-semibold text-mist-950 dark:text-white">{item.title}</p>
                <p className="mt-1 text-sm/7 text-mist-700 dark:text-mist-300">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-mist-600 dark:text-mist-400">
          Deep dive: <Link href={`${site.urls.docs}/security/defense-in-depth`}>defense-in-depth</Link> ·{' '}
          <Link href={site.urls.enterpriseGtm}>enterprise GTM</Link>
        </p>
      </Section>

      <Section
        id="starter"
        eyebrow="IDP Starter"
        headline={`${pricing.starter.monthlyPrice}/month — pipeline, VDR, and agents included`}
        subheadline={
          <p>
            Replace a median ~$150K ABBYY-class contract and a per-page VDR invoice with a flat Starter subscription.
            Self-host remains free forever on Apache 2.0. See <Link href={site.urls.pricing}>full pricing</Link> for
            Business and Professional volume tiers.
          </p>
        }
      >
        <ul className="grid gap-3 text-sm/7 text-mist-800 sm:grid-cols-2 dark:text-mist-200">
          {[
            'Full document lifecycle (ingest → distribute)',
            'ConeShare VDR — unlimited rooms, no per-page meter',
            'MCP-native agent orchestration',
            'Merkle audit trail per pipeline step',
            'Onyx semantic search over the archive',
            '14-day trial · no credit card',
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <CheckmarkIcon aria-hidden className="mt-0.5 size-5 shrink-0 stroke-mist-950 dark:stroke-white" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <ButtonLink href={site.urls.signup} size="lg">
            Start free trial
          </ButtonLink>
          <PlainButtonLink href={site.urls.pricing} size="lg">
            Compare all plans <ArrowNarrowRightIcon />
          </PlainButtonLink>
        </div>
      </Section>

      <CallToActionSimpleCentered
        id="cta"
        headline="Is this the document platform you've been looking for?"
        subheadline={
          <p>
            Ops and compliance teams: start with IDP. When you are ready, the same endpoint is also an inference gateway
            and memory system — without a second vendor conversation. Strategy detail:{' '}
            <Link href={site.urls.idpGtm}>IDP GTM playbook</Link>.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start 14-day trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/deployment/kubernetes`} size="lg">
              Deploy self-hosted <ArrowNarrowRightIcon />
            </PlainButtonLink>
            <PlainButtonLink href={site.urls.contact} size="lg">
              Talk to us <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
