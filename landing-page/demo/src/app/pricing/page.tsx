import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { FAQsAccordion, Faq } from '@/components/sections/faqs-accordion'
import { PlanComparisonTable } from '@/components/sections/plan-comparison-table'
import { Plan, PricingHeroMultiTier } from '@/components/sections/pricing-hero-multi-tier'
import { Section } from '@/components/elements/section'
import { managedPrice, annualBillingSavingsLabel, pricing, pricingPlanNames, type BillingPeriod } from '@/lib/pricing'
import { site } from '@/lib/site'

function plans(billing: BillingPeriod) {
  const annualNote =
    billing === 'Yearly' ? (
      <span className="block text-mist-500">
        {' '}
        Billed annually ($3,000/yr shared · $6,000/yr dedicated) — {annualBillingSavingsLabel} vs monthly billing.
      </span>
    ) : null

  return (
    <>
      <Plan
        name={pricing.selfHosted.name}
        price={pricing.selfHosted.price}
        period={pricing.selfHosted.period}
        subheadline={<p>{pricing.selfHosted.subheadline}</p>}
        features={[...pricing.selfHosted.features]}
        cta={
          <ButtonLink href={`${site.urls.docs}/readme/getting-started`} size="lg">
            Quick start
          </ButtonLink>
        }
      />
      <Plan
        name={pricing.shared.name}
        price={managedPrice('shared', billing)}
        period={pricing.shared.period}
        subheadline={
          <p>
            {pricing.shared.subheadline}
            {annualNote}
          </p>
        }
        badge={pricing.shared.badge}
        features={[...pricing.shared.features]}
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Join early access
          </ButtonLink>
        }
      />
      <Plan
        name={pricing.dedicated.name}
        price={managedPrice('dedicated', billing)}
        period={pricing.dedicated.period}
        subheadline={
          <p>
            {pricing.dedicated.subheadline}
            {annualNote}
          </p>
        }
        badge={pricing.dedicated.badge}
        features={[...pricing.dedicated.features]}
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Join early access
          </ButtonLink>
        }
      />
    </>
  )
}

export const metadata = {
  title: 'Pricing',
}

export default function Page() {
  return (
    <>
      <PricingHeroMultiTier
        id="pricing"
        headline="Pricing"
        subheadline={
          <p>
            {site.earlyAccess.summary} Self-host the full stack free on your hardware today. Shared and dedicated
            managed tiers are in early access — join the waitlist for founder-led onboarding.
          </p>
        }
        options={['Monthly', 'Yearly']}
        annualSavingsLabel={annualBillingSavingsLabel}
        plans={{ Monthly: plans('Monthly'), Yearly: plans('Yearly') }}
      />

      <Section id="early-access" eyebrow="Early access" headline="Managed hosting is onboarding its first tenants">
        <p className="max-w-3xl text-sm/7 text-mist-700 dark:text-mist-400">{site.earlyAccess.pricingNote}</p>
        <p className="mt-4 max-w-3xl text-sm/7 text-mist-600 dark:text-mist-500">{site.waitlistPromise}</p>
      </Section>

      <PlanComparisonTable
        id="pricing-compare"
        plans={[...pricingPlanNames]}
        features={[
          {
            title: 'Hosting model',
            features: [
              { name: 'Your own hardware', value: { 'Self-hosted': true, Shared: false, Dedicated: false } },
              {
                name: 'Multi-tenant shared infra',
                value: { 'Self-hosted': false, Shared: true, Dedicated: false },
              },
              {
                name: 'Dedicated hardware (single-tenant)',
                value: { 'Self-hosted': false, Shared: false, Dedicated: true },
              },
              {
                name: 'Full isolation for compliance',
                value: { 'Self-hosted': true, Shared: false, Dedicated: true },
              },
            ],
          },
          {
            title: 'Core MCP',
            features: [
              { name: 'search & execute', value: true },
              { name: 'audit & cache', value: true },
              { name: 'Bundled providers', value: true },
              { name: 'Stdio MCP', value: true },
              {
                name: 'Hosted HTTP MCP',
                value: { 'Self-hosted': false, Shared: true, Dedicated: true },
              },
            ],
          },
          {
            title: 'IDP document pipeline',
            features: [
              { name: 'Eight bundled vendors', value: true },
              { name: 'run_idp_pipeline', value: true },
              { name: 'classify_document', value: true },
              { name: 'extract_document', value: true },
              {
                name: 'ClawQL Archive Layer (managed)',
                value: {
                  'Self-hosted': 'Paperless-ngx optional',
                  Shared: true,
                  Dedicated: true,
                },
              },
              {
                name: 'hitl_enqueue_label_studio',
                value: {
                  'Self-hosted': 'Self-deploy Label Studio',
                  Shared: false,
                  Dedicated: false,
                },
              },
            ],
          },
          {
            title: 'Memory & knowledge',
            features: [
              {
                name: 'Vault memory (memory_recall)',
                value: { 'Self-hosted': 'Self-managed', Shared: true, Dedicated: true },
              },
              { name: 'Document ingest', value: true },
              {
                name: 'Onyx enterprise search',
                value: { 'Self-hosted': 'Self-managed', Shared: true, Dedicated: true },
              },
            ],
          },
          {
            title: 'Support',
            features: [
              { name: 'Community support', value: { 'Self-hosted': true, Shared: true, Dedicated: true } },
              {
                name: 'Email support',
                value: { 'Self-hosted': false, Shared: true, Dedicated: 'Priority' },
              },
              {
                name: 'SSO / RBAC',
                value: { 'Self-hosted': false, Shared: false, Dedicated: true },
              },
            ],
          },
        ]}
      />

      <Section
        id="enterprise"
        eyebrow="Enterprise"
        headline="High volume, custom SLAs, and on-call support"
        subheadline={<p>{pricing.enterprise.subheadline} Enterprise includes managed HITL via hitl_enqueue_label_studio.</p>}
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pricing.enterprise.features.map((feature) => (
            <li
              key={feature}
              className="rounded-xl bg-mist-950/2.5 px-4 py-3 text-sm/7 text-mist-700 dark:bg-white/5 dark:text-mist-400"
            >
              {feature}
            </li>
          ))}
        </ul>
        <ButtonLink href={site.urls.contact} size="lg" className="mt-8">
          Contact sales
        </ButtonLink>
      </Section>

      <FAQsAccordion id="faqs" headline="Pricing questions">
        <Faq
          id="faq-1"
          question="Is self-hosted really free?"
          answer="Yes. ClawQL is open source. You pay only for the compute and storage on your own hardware. All core MCP tools are included with no license fee."
        />
        <Faq
          id="faq-2"
          question="What's the difference between shared and dedicated managed hosting?"
          answer="Shared managed hosting is multi-tenant — your workload runs alongside other customers on the same infrastructure. It's more affordable but may see reduced performance during burst periods and does not provide complete isolation if regulators or compliance require it. Dedicated managed hosting deploys onto hardware reserved for your organization only — no other customers, full isolation."
        />
        <Faq
          id="faq-3"
          question="Can I switch from shared to dedicated later?"
          answer="Yes. Vault exports, provider auth, and pipeline configuration can migrate between tiers. Contact us when your compliance or performance requirements outgrow shared hosting."
        />
        <Faq
          id="faq-4"
          question="Do you publish enterprise pricing?"
          answer="Enterprise contracts are custom-scoped for very high volume, dedicated SLAs, and on-call support. We don't list a fixed price — engagements typically start around $3,000/month depending on requirements. Contact sales to discuss."
        />
      </FAQsAccordion>

      <CallToActionSimpleCentered
        id="call-to-action"
        headline="Start free or join early access"
        subheadline={<p>Install clawql-mcp on your hardware, or join the waitlist for managed Shared and Dedicated hosting.</p>}
        cta={
          <div className="flex items-center gap-4">
            <ButtonLink href={site.urls.signup} size="lg">
              Join early access
            </ButtonLink>
            <PlainButtonLink href={site.urls.docs} size="lg">
              Self-host guide <ChevronIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
