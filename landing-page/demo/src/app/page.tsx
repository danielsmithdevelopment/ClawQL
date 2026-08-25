import { AnnouncementBadge } from '@/components/elements/announcement-badge'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ClawQLHeroLogo } from '@/components/elements/clawql-hero-logo'
import { InstallCommand } from '@/components/elements/install-command'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import {
  ClosedLoopSteps,
  OpenBenchProofTable,
  ProofChipRow,
  ToolTierSection,
} from '@/components/sections/clawql-marketing'
import { FAQsTwoColumnAccordion, Faq } from '@/components/sections/faqs-two-column-accordion'
import { HeroTwoColumnWithPhoto } from '@/components/sections/hero-two-column-with-photo'
import { Plan, PricingMultiTier } from '@/components/sections/pricing-multi-tier'
import { SecuritySection } from '@/components/sections/security-section'
import {
  clawqlTeeSummary,
  homepageProofChips,
  mcpToolTiers,
  openBenchMiniFirm,
  protocolFabricSurfaces,
} from '@/lib/marketing'
import { pricing } from '@/lib/pricing'
import { securityEnforcementLayers, securityPillars } from '@/lib/security-marketing'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const closedLoopSteps = [
  {
    title: 'Recall',
    body: 'Pull prior vault notes and structured ontology matches — institutional context, not a blank session.',
  },
  {
    title: 'Search',
    body: 'Rank API operations by intent. Specs stay server-side; agents get operation IDs and parameter hints.',
  },
  {
    title: 'Execute',
    body: 'Run validated calls over REST, GraphQL, or gRPC. Lean responses keep results out of your context budget.',
  },
  {
    title: 'Ingest',
    body: 'Persist decisions with memory_ingest so the next session — Cursor, OpenClaw, or K8s — continues the trail.',
  },
] as const

export const metadata = pageMetadata({
  title: 'Home',
  absoluteTitle: 'ClawQL — Agentic Infrastructure for Regulated Industries',
  description: site.description,
  path: '/',
})

export default function Page() {
  return (
    <>
      <HeroTwoColumnWithPhoto
        id="hero"
        eyebrow={<AnnouncementBadge href={site.urls.signup} text={site.earlyAccess.badge} cta="Start trial" />}
        headline="Anything to MCP. MCP to anything."
        subheadline={
          <p>
            ClawQL is agentic infrastructure for production work in regulated industries. Autonomous event-driven
            agents. Structured institutional knowledge recall. Hardware-verified trusted execution. A WORM audit trail
            on every action — before every acknowledgment.
          </p>
        }
        cta={
          <div className="flex w-full max-w-xl flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={site.urls.signup} size="lg">
                Start free trial
              </ButtonLink>
              <PlainButtonLink href={`${site.urls.docs}/readme/getting-started`} size="lg">
                Self-host free <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
            <InstallCommand className="w-full max-w-lg" snippet={site.installCommand} />
            <ProofChipRow chips={homepageProofChips} />
          </div>
        }
        photo={<ClawQLHeroLogo />}
        photoFrame={false}
      />

      <Section
        id="fabric"
        eyebrow="The protocol fabric"
        headline="Any protocol in. Any protocol out. MCP in the middle."
        subheadline={
          <p>
            ClawQL Core turns API surfaces into MCP tools — {protocolFabricSurfaces.inbound}. mcp-api-adapter exposes
            any MCP server outward — {protocolFabricSurfaces.outbound}. A gRPC service talks to a GraphQL consumer. A QR
            stream from an air-gapped system becomes agent-callable without a network path across the boundary.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={protocolFabricSurfaces.docsHref}>
              Protocol Fabric docs <ArrowNarrowRightIcon />
            </Link>
            <Link href={protocolFabricSurfaces.adapterHref}>
              mcp-api-adapter <ArrowNarrowRightIcon />
            </Link>
            <Link href={site.urls.agents}>
              Agentic platform <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">In</p>
            <h3 className="text-base font-semibold text-mist-950 dark:text-white">ClawQL Core → MCP</h3>
            <p className="text-sm/7 text-mist-700 dark:text-mist-400">{protocolFabricSurfaces.inbound}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">Out</p>
            <h3 className="text-base font-semibold text-mist-950 dark:text-white">mcp-api-adapter → any surface</h3>
            <p className="text-sm/7 text-mist-700 dark:text-mist-400">{protocolFabricSurfaces.outbound}</p>
          </div>
        </div>
      </Section>

      <Section
        id="autonomous"
        eyebrow="ClawQL Streams"
        headline="Agents that don't wait for you."
        subheadline={
          <p>
            Every other agent platform requires a human to start the session. A{' '}
            <code className="text-sm">stream_subscribe</code> call points at any event source — WebSocket, NATS,
            webhook, cron, polled API, or QR stream. When an event crosses the significance threshold, an agent session
            spawns: memory recall, ontology queries, tool execution, optional Ouroboros convergence — then a human
            reviews via <code className="text-sm">/mcp-ui</code>. The decision lands in the WORM trail. No human starts
            the session. No developer builds the interface.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={site.urls.streams}>
              Streams <ArrowNarrowRightIcon />
            </Link>
            <Link href={`${site.urls.docs}/mcp/mcp-ui`}>
              /mcp-ui <ArrowNarrowRightIcon />
            </Link>
            <Link href={site.urls.agents}>
              Agents landing <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      />

      <Section
        id="proof"
        eyebrow="OpenBench proof"
        headline="Memory that closes sets, not approximates them."
        subheadline={
          <p>
            Semantic recall returns what looks relevant. Structured ontology recall returns what matches — exactly, with
            no extras. We rebuilt the Calderwood &amp; Harkness near-miss failure mode as an OpenBench mini-firm harness
            (B-7), then fixed it structurally with CQE-typed predicates.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={openBenchMiniFirm.essayUrl}>
              Memory Finds. Ontology Decides. <ArrowNarrowRightIcon />
            </Link>
            <Link href={openBenchMiniFirm.runUrl}>
              GitHub Actions run {openBenchMiniFirm.runId} <ArrowNarrowRightIcon />
            </Link>
            <Link href="https://docs.clawql.com/benchmarks">
              Context-compression benchmark <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <OpenBenchProofTable caption={openBenchMiniFirm.caption} rows={openBenchMiniFirm.rows} />
          <p className="text-sm text-mist-600 dark:text-mist-400">{openBenchMiniFirm.caption}</p>
        </div>
      </Section>

      <Section
        id="how-it-works"
        eyebrow="How it fits together"
        headline="Recall → search → execute → ingest."
        subheadline={
          <p>
            One closed loop for APIs, memory, and documents. Case studies on docs.clawql.com show the same pattern
            shipping Cloudflare Workers, recalling Cursor roadmaps from OpenClaw, and filing GitHub issues from vault
            context — without pasting specs into the chat.
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/case-studies/cloudflare-docs-mcp`}>
            Example case study <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <ClosedLoopSteps steps={closedLoopSteps} />
      </Section>

      <Section
        id="tools"
        eyebrow="MCP tools"
        headline="Core discovery and execution — always on."
        subheadline={
          <p>
            Memory, documents, automation, and the IDP pipeline opt in when you need them — same surface in Cursor,
            OpenClaw, or your Kubernetes cluster. Document workflows (Nextcloud → OCR → redaction → Onyx → VDR) live on
            the{' '}
            <Link href={site.urls.idp} className="font-medium underline underline-offset-2">
              IDP page
            </Link>
            .
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/tools`}>
            Full tool reference <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <ToolTierSection {...mcpToolTiers.core} />
      </Section>

      <SecuritySection
        id="security"
        eyebrow="Security & TEE"
        headline="Documented, reproducible — and TEE-ready."
        subheadline={
          <p>
            ClawQL documents how container images are scanned, signed, and enforced from CI through Kubernetes admission
            — plus a 32-module curriculum for agentic AI deployments. ATR scoping limits what each agent can call;
            Panguard fails closed when scope is unclear.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={`${site.urls.docs}/security`}>
              Security hub <ArrowNarrowRightIcon />
            </Link>
            <Link href={`${site.urls.docs}/security/best-practices`}>
              32-module curriculum <ArrowNarrowRightIcon />
            </Link>
            <Link href={clawqlTeeSummary.href}>
              clawql-tee specification <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
        pillars={securityPillars}
        enforcementLayers={securityEnforcementLayers}
      />

      <Section
        id="tee"
        eyebrow="clawql-tee"
        headline="Hardware-verified agent execution."
        subheadline={<p>{clawqlTeeSummary.body}</p>}
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={clawqlTeeSummary.href}>
              clawql-tee specification <ArrowNarrowRightIcon />
            </Link>
            <Link href="https://rockyourlobster.com">
              RockYourLobster deployments <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      />

      <FAQsTwoColumnAccordion id="faqs" headline="Questions & Answers">
        <Faq
          id="faq-1"
          question="What's the difference between cache, audit, and memory_*?"
          answer="cache is ephemeral LRU scratch for the active session — gone on restart. audit is an in-process ring buffer for structured operator events. memory_ingest and memory_recall persist Markdown in your Obsidian vault with wikilinks — durable institutional knowledge across sessions. Structured ontology filters on memory_recall close exact entity sets instead of approximating with semantic search."
        />
        <Faq
          id="faq-2"
          question="What's the difference between Developer, Teams, and Starter?"
          answer={`Developer (${pricing.developer.monthlyPrice}/mo) is MCP gateway + memory — no IDP. Teams (${pricing.teams.monthlyPrice}/mo) adds full Onyx search. Starter (${pricing.starter.monthlyPrice}/mo) activates the IDP plugin bundle. Gateway-only buyers should not pay for document processing they do not use.`}
        />
        <Faq
          id="faq-3"
          question="How is this different from managed agent platforms?"
          answer="Managed platforms wait for a human to start a session and keep audit on their side. ClawQL Streams wakes agents from event sources, Protocol Fabric connects any protocol via MCP, and the WORM trail stays on your bucket or cluster. Self-host on Apache 2.0, or use clawql-tee when the operator itself cannot be in the trust model."
        />
        <Faq
          id="faq-4"
          question="Do you offer enterprise contracts?"
          answer={`Yes — Enterprise starts from ${pricing.enterprise.priceFrom}${pricing.enterprise.period} for dedicated nodes, custom fine-tuning, multi-region, DPA/BAA, and a dedicated CSM. Contact sales to scope annual terms. Hardened agent deployments with TEE are also available via RockYourLobster.`}
        />
        <Faq
          id="faq-5"
          question="Is managed hosting available today?"
          answer="The open-source MCP core is production-ready today — npm, Helm, case studies, and a Kubernetes operator. Self-host free on Apache 2.0, or start a 14-day Developer trial. Managed IDP hosting is early access with founder-led onboarding."
        />
        <Faq
          id="faq-6"
          question="How does ClawQL handle supply chain and runtime security?"
          answer="Container images pass OSV, Trivy, and SBOM gates in CI, are Cosign-signed, and Kyverno verifyImages rejects unsigned digests at deploy time by default. Runtime layers — MCP ATR scoping, audit, sandbox isolation, PII redaction in the IDP pipeline — are documented in the 32-module security curriculum on docs.clawql.com/security."
        />
      </FAQsTwoColumnAccordion>

      <PricingMultiTier
        id="pricing"
        headline="Pricing"
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
                <ButtonLink href={`${site.urls.docs}/readme/getting-started`} size="lg">
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
        headline={`Enterprise from ${pricing.enterprise.priceFrom}${pricing.enterprise.period}`}
        subheadline={<p>{pricing.enterprise.subheadline}</p>}
        cta={
          <ButtonLink href={site.urls.contact} size="lg">
            Contact sales
          </ButtonLink>
        }
      />
      <CallToActionSimple
        id="call-to-action"
        headline="Start your 14-day trial or self-host free"
        subheadline={
          <p>
            Gateway from {pricing.developer.monthlyPrice}/mo, IDP bundle from {pricing.starter.monthlyPrice}/mo. Full
            Apache 2.0 stack, no license fee.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={site.urls.docs} size="lg">
              Self-host guide <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
