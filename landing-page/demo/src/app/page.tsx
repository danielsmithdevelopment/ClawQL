import { AnnouncementBadge } from '@/components/elements/announcement-badge'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ClawQLHeroLogo } from '@/components/elements/clawql-hero-logo'
import { InstallCommand } from '@/components/elements/install-command'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { IdpStageCard, ToolTierSection } from '@/components/sections/clawql-marketing'
import { FAQsTwoColumnAccordion, Faq } from '@/components/sections/faqs-two-column-accordion'
import { HeroTwoColumnWithPhoto } from '@/components/sections/hero-two-column-with-photo'
import { Plan, PricingMultiTier } from '@/components/sections/pricing-multi-tier'
import { SecuritySection } from '@/components/sections/security-section'
import { Stat, StatsFourColumns } from '@/components/sections/stats-four-columns'
import { WorkflowFeedSection } from '@/components/sections/workflow-feed'
import { idpPipelineStages, mcpToolTiers, multiProviderBenchmark } from '@/lib/marketing'
import { pricing } from '@/lib/pricing'
import { securityEnforcementLayers, securityPillars } from '@/lib/security-marketing'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'
import { workflowFeeds } from '@/lib/workflow-feeds'

export const metadata = pageMetadata({
  title: 'Home',
  absoluteTitle: 'ClawQL — Agentic Gateway for Auditable Production AI',
  description: site.description,
  path: '/',
})

export default function Page() {
  return (
    <>
      {/* Hero */}
      <HeroTwoColumnWithPhoto
        id="hero"
        eyebrow={<AnnouncementBadge href={site.urls.signup} text={site.earlyAccess.badge} cta="Start trial" />}
        headline="ClawQL — the Agentic Gateway for Auditable Production AI"
        subheadline={
          <p>
            The Foundational Platform agents call into — not an agent framework. Land with OpenAI-compatible inference
            and native <code>/mcp</code>, then expand into memory, Dedicated Virtual Gateway governance, and Edge
            Gateways across your fleet. One closed loop: <strong>recall</strong>, <strong>search</strong>,{' '}
            <strong>execute</strong>, and <strong>ingest</strong> — with specs server-side, not in your prompt.
          </p>
        }
        cta={
          <div className="flex w-full max-w-xl flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={site.urls.signup} size="lg">
                Start free trial
              </ButtonLink>
              <PlainButtonLink href={`${site.urls.docs}/getting-started`} size="lg">
                Self-host free <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
            <InstallCommand className="w-full max-w-lg" snippet={site.installCommand} />
          </div>
        }
        photo={<ClawQLHeroLogo />}
        photoFrame={false}
      />

      {/* Workflow feeds — proof before tool grid */}
      <WorkflowFeedSection
        id="workflows"
        eyebrow="Workflows in practice"
        headline="What a real ClawQL session looks like."
        subheadline={
          <p>
            Published case studies document the same pattern: agents call MCP tools in sequence — recall context,
            discover operations with <code className="text-sm">search</code>, act with{' '}
            <code className="text-sm">execute</code>, then persist outcomes with{' '}
            <code className="text-sm">memory_ingest</code>. These feeds show the chronology without pasting specs into
            the chat.
          </p>
        }
        feeds={workflowFeeds}
      />

      {/* Token savings benchmark — lead differentiator */}
      <StatsFourColumns
        id="proof"
        eyebrow="Context compression"
        headline={`${multiProviderBenchmark.compressionRatio} compression — ${multiProviderBenchmark.indexedOperations} endpoints indexed, ${multiProviderBenchmark.workflowOperations} surfaced per workflow.`}
        subheadline={
          <p>
            The answer to &ldquo;won&apos;t this just fill up my context?&rdquo; Offline benchmark across{' '}
            {multiProviderBenchmark.providers}: stand up GKE, configure Cloudflare DNS, and draft a Jira rollout — with
            planning tokens dropping from {multiProviderBenchmark.planningTokensBefore} to{' '}
            {multiProviderBenchmark.planningTokensAfter}.
          </p>
        }
        cta={
          <Link href={multiProviderBenchmark.href}>
            Read the benchmark <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <Stat
          stat={multiProviderBenchmark.compressionRatio}
          text="Compression ratio on the three-provider benchmark — measured with ceil(bytes ÷ 4) token estimates."
        />
        <Stat
          stat={multiProviderBenchmark.indexedOperations}
          text="API operations indexed across Google Cloud (4,141), Cloudflare (2,697), and Jira (336) — specs stay in the MCP server."
        />
        <Stat
          stat={multiProviderBenchmark.workflowOperations}
          text="Unique operations returned by search across 14 workflow steps — the candidates an agent actually needs."
        />
        <Stat
          stat={`${multiProviderBenchmark.planningTokensBefore} → ${multiProviderBenchmark.planningTokensAfter}`}
          text="Planning-context tokens: naive full-spec paste vs compact workflow artifact (~99.9% reduction)."
        />
      </StatsFourColumns>

      {/* Closed loop summary before tool grid */}
      <Section
        id="how-it-works"
        eyebrow="How it fits together"
        headline="Memory, APIs, and documents in one closed loop."
        subheadline={
          <p>
            A typical session: an agent <strong>recalls</strong> prior vault notes about a deployment,{' '}
            <strong>searches</strong> Cloudflare and GCP for the right DNS and cluster operations,{' '}
            <strong>executes</strong> them with validated args, then <strong>ingests</strong> the outcome so the next
            session — in Cursor, OpenClaw, or your cluster — picks up where this one left off. Document workflows follow
            the same pattern through the IDP pipeline.
          </p>
        }
      />

      {/* MCP tool tiers */}
      <Section
        id="tools"
        eyebrow="MCP tools"
        headline="Every tool has a job — and a clear boundary."
        subheadline={
          <p>
            Core discovery and execution are always on. Memory, documents, automation, and the IDP pipeline opt in when
            you need them — same surface in Cursor, OpenClaw, or your Kubernetes cluster.
          </p>
        }
      >
        <div className="flex flex-col gap-10">
          <ToolTierSection {...mcpToolTiers.core} />
          <ToolTierSection {...mcpToolTiers.memory} />
          <ToolTierSection {...mcpToolTiers.automation} />
          <ToolTierSection {...mcpToolTiers.idp} />
        </div>
      </Section>

      {/* IDP pipeline */}
      <Section
        id="idp"
        eyebrow="Intelligent document processing"
        headline="Eight vendors. One agent-composable pipeline."
        subheadline={
          <p>
            Drop a file in Nextcloud; agents orchestrate layout parsing, PDF normalization, PII redaction, archival,
            hybrid search, and secure sharing — via <code className="text-sm">search</code> →{' '}
            <code className="text-sm">execute</code> or automated <code className="text-sm">run_idp_pipeline</code>.
            Self-host the full stack with Helm; managed accounts run the ClawQL Archive Layer (Nextcloud + Onyx-indexed
            metadata) by default.
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/providers/idp-pipeline`}>
            IDP pipeline reference <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {idpPipelineStages.map((stage) => (
            <IdpStageCard key={stage.vendor} {...stage} />
          ))}
        </div>
      </Section>

      {/* Security */}
      <SecuritySection
        id="security"
        eyebrow="Security"
        headline="Built to prove, not just claim."
        subheadline={
          <p>
            ClawQL documents how container images are scanned, signed, and enforced from CI through Kubernetes admission
            — plus a 32-module curriculum for agentic AI deployments. Same controls on self-hosted Helm and dedicated
            managed accounts.
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/security`}>
            Read the security hub <ArrowNarrowRightIcon />
          </Link>
        }
        pillars={securityPillars}
        enforcementLayers={securityEnforcementLayers}
      />

      {/* FAQs */}
      <FAQsTwoColumnAccordion id="faqs" headline="Questions & Answers">
        <Faq
          id="faq-1"
          question="What's the difference between cache, audit, and memory_*?"
          answer="cache is ephemeral LRU scratch for the active session — gone on restart. audit is an in-process ring buffer for structured operator events. memory_ingest and memory_recall persist Markdown in your Obsidian vault with wikilinks — durable institutional knowledge across sessions."
        />
        <Faq
          id="faq-2"
          question="What's the difference between Developer, Teams, and Starter?"
          answer={`Developer (${pricing.developer.monthlyPrice}/mo) is Agentic Gateway + memory — no IDP. Teams (${pricing.teams.monthlyPrice}/mo) adds full Onyx search. Starter (${pricing.starter.monthlyPrice}/mo) activates the IDP plugin bundle. Gateway-only buyers should not pay for document processing they do not use.`}
        />
        <Faq
          id="faq-3"
          question="Can OpenClaw or Cursor use the same vault?"
          answer="Yes. Point CLAWQL_OBSIDIAN_VAULT_PATH at a shared vault mount. OpenClaw agents call memory_recall over Streamable HTTP and get notes ingested from prior Cursor sessions — validated in our June 2026 case study."
        />
        <Faq
          id="faq-4"
          question="Do you offer enterprise contracts?"
          answer={`Yes — Enterprise starts from ${pricing.enterprise.priceFrom}${pricing.enterprise.period} for dedicated nodes, custom fine-tuning, EU multi-region, DPA/BAA, and a dedicated CSM. Contact sales to scope annual terms.`}
        />
        <Faq
          id="faq-5"
          question="Is managed hosting available today?"
          answer="The open-source MCP core is production-ready today — npm, Helm, case studies, and a Kubernetes operator. Self-host free on Apache 2.0, or start a 14-day Developer trial. Managed IDP hosting is early access with founder-led onboarding. We are pre-revenue on managed hosting; the architecture is shipped, references and compliance history are still building."
        />
        <Faq
          id="faq-6"
          question="How does ClawQL handle supply chain and runtime security?"
          answer="Container images pass OSV, Trivy, and SBOM gates in CI, are Cosign-signed, and Kyverno verifyImages rejects unsigned digests at deploy time by default. Runtime layers — MCP ATR scoping, audit, sandbox isolation, PII redaction in the IDP pipeline — are documented in the 32-module security curriculum and defense-in-depth guide on docs.clawql.com/security."
        />
      </FAQsTwoColumnAccordion>

      {/* Pricing teaser — full grid on /pricing */}
      <PricingMultiTier
        id="pricing"
        headline="Start your 14-day trial or self-host free"
        subheadline={
          <p className="text-center text-sm/7 text-mist-600 dark:text-mist-400">{site.earlyAccess.pricingNote}</p>
        }
        plans={
          <>
            <Plan
              name={pricing.selfHosted.name}
              price={pricing.selfHosted.price}
              period={pricing.selfHosted.period}
              subheadline={<p>{pricing.selfHosted.subheadline}</p>}
              features={pricing.selfHosted.features.slice(0, 4)}
              cta={
                <ButtonLink href={`${site.urls.docs}/getting-started`} size="lg">
                  Quick start
                </ButtonLink>
              }
            />
            <Plan
              name={pricing.developer.name}
              price={pricing.developer.monthlyPrice}
              period={pricing.developer.period}
              subheadline={<p>{pricing.developer.subheadline}</p>}
              badge={pricing.developer.badge}
              features={pricing.developer.features.slice(0, 4)}
              cta={
                <ButtonLink href={site.urls.signup} size="lg">
                  Start free trial
                </ButtonLink>
              }
            />
            <Plan
              name={pricing.teams.name}
              price={pricing.teams.monthlyPrice}
              period={pricing.teams.period}
              subheadline={<p>{pricing.teams.subheadline}</p>}
              badge={pricing.teams.badge}
              features={pricing.teams.features.slice(0, 4)}
              cta={
                <ButtonLink href={site.urls.signup} size="lg">
                  Join early access
                </ButtonLink>
              }
            />
            <Plan
              name={pricing.starter.name}
              price={pricing.starter.monthlyPrice}
              period={pricing.starter.period}
              subheadline={<p>{pricing.starter.subheadline}</p>}
              badge={pricing.starter.badge}
              features={pricing.starter.features.slice(0, 4)}
              cta={
                <PlainButtonLink href={site.urls.pricing} size="lg">
                  All tiers & limits <ArrowNarrowRightIcon />
                </PlainButtonLink>
              }
            />
          </>
        }
      />

      <CallToActionSimple
        id="enterprise-pricing"
        headline="Need enterprise SLAs or on-call support?"
        subheadline={<p>{pricing.enterprise.subheadline}</p>}
        cta={
          <ButtonLink href={site.urls.contact} size="lg">
            Contact sales
          </ButtonLink>
        }
      />
    </>
  )
}
