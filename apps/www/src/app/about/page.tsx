import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { CaseStudyCard, CaseStudyGrid, ToolTierSection } from '@/components/sections/clawql-marketing'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { caseStudies, mcpToolTiers } from '@/lib/marketing'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'About',
  description:
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, and Edge swarm.',
  path: '/about',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        headline="ClawQL — the Agentic Gateway for Auditable Production AI"
        subheadline={
          <p>
            ClawQL is the Foundational Platform where agents <strong>search</strong> APIs, <strong>execute</strong>{' '}
            operations, <strong>recall</strong> vault knowledge, <strong>ingest</strong> documents, and{' '}
            <strong>audit</strong> what happened — from multi-tenant Regional Hubs to Dedicated Virtual Gateways and
            Edge Gateways on every laptop.
          </p>
        }
      />

      <Section
        id="story"
        eyebrow="Why ClawQL exists"
        headline="Built from production agent work"
        subheadline={
          <p>
            ClawQL started as the MCP layer behind real deployments: multi-provider DevOps workflows, document pipelines
            for regulated industries, and cross-session memory that survives when you switch between Cursor, OpenClaw,
            and Kubernetes. The open-source core ships what we run in production.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-6 text-sm/7 text-mist-700 sm:grid-cols-2 lg:grid-cols-3 dark:text-mist-400">
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">ClawQL and See The Greens</h3>
            <p className="mt-2">
              See The Greens is a mortgage-first loan origination system powered by ClawQL — the same IDP pipeline,
              vault memory, and HITL patterns documented on this site. ClawQL is the horizontal platform; See The Greens
              is one vertical product built on it. Lenders can self-host ClawQL or build their own LOS on the same
              stack.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Current state</h3>
            <p className="mt-2">
              The open-source MCP server is production-ready and self-hostable today — npm, Helm, published case
              studies, and a v7 operator for Kubernetes. Managed gateway hosting is in early access (14-day Developer
              trial, then paid tiers). IDP hosted tenants are onboarding with founder-led setup. We are pre-revenue on
              managed hosting; the core product is shipping and in use.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">First buyers</h3>
            <p className="mt-2">
              Document-heavy teams of 20–200 people in legal, M&A diligence, healthcare operations, and lending — teams
              that already spend $500–2k/mo on SaaS and need agent memory plus document intelligence.
              Gateway-only developers evaluating MCP infrastructure start on Developer or Teams; IDP activates when they
              need classify/extract and VDR.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Early access, founder-led</h3>
            <p className="mt-2">
              Managed hosting onboarding is founder-led — not self-serve checkout. Hosted slots are limited while we
              validate pipeline reliability under real workloads. Architecture earns trust over time; we do not claim
              compliance certifications or decade-long references we do not have yet.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 sm:col-span-2 lg:col-span-1 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">What we publish</h3>
            <p className="mt-2">
              Case studies include tool traces, failure modes, fixes, and token measurements. The{' '}
              <Link href={site.urls.releases}>GitHub release changelog</Link> tracks what ships each version; docs at{' '}
              <Link href={site.urls.docs}>docs.clawql.com</Link> stay aligned with the codebase.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="philosophy"
        eyebrow="What we build"
        headline="Three problems — one platform, activated in layers"
        subheadline={
          <p>
            Current agent systems lose context, burn tokens on API specs, and treat documents as afterthoughts. Plugin
            bundles let you solve gateway and memory first; add IDP and sovereign inference only when your workload
            needs them.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-6 text-sm/7 text-mist-700 sm:grid-cols-3 dark:text-mist-400">
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Persistence gap</h3>
            <p className="mt-2">
              Context windows are ephemeral. <code className="text-sm">memory_ingest</code> and{' '}
              <code className="text-sm">memory_recall</code> give agents institutional memory that survives restarts,
              product switches, and new chat threads.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Token efficiency</h3>
            <p className="mt-2">
              GitHub&apos;s bundled spec alone is ~2.28M planning tokens. <code className="text-sm">search</code>{' '}
              returns ranked operation IDs in thousands of tokens — measured in our published GitHub provider case
              study.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Document intelligence</h3>
            <p className="mt-2">
              Eight bundled IDP vendors compose intake through secure sharing. Agents orchestrate real document
              pipelines — classify, extract, archive, search — built around purpose-built extraction tools rather than
              one-off OCR prompts.
            </p>
          </div>
        </div>
      </Section>

      <Section id="tools" headline="Tool surface">
        <div className="flex flex-col gap-10">
          <ToolTierSection {...mcpToolTiers.core} />
          <ToolTierSection {...mcpToolTiers.memory} />
          <ToolTierSection {...mcpToolTiers.idp} />
        </div>
      </Section>

      <CaseStudyGrid
        id="case-studies"
        headline="Evidence"
        subheadline={
          <p>
            Case studies include tool traces, failure modes, fixes, and token measurements — the same detail we expect
            from production engineering write-ups.
          </p>
        }
      >
        {caseStudies.slice(0, 3).map((study) => (
          <CaseStudyCard key={study.slug} {...study} />
        ))}
      </CaseStudyGrid>

      <CallToActionSimple
        id="call-to-action"
        headline="Read the case studies. Run the tools."
        subheadline={
          <p>
            Self-host today or start a 14-day Developer trial. For the default product-led motion, see the{' '}
            <Link href={site.urls.inferenceGtm}>inference-first GTM playbook</Link>; for regulated / Palantir-facing
            positioning, see the <Link href={site.urls.enterpriseGtm}>enterprise GTM playbook</Link>. Full Apache 2.0
            stack, no license fee.
          </p>
        }
        cta={
          <div className="flex items-center gap-4">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/case-studies`} size="lg">
              All case studies <ChevronIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
