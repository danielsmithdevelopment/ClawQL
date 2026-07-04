import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { NewsletterForm } from '@/components/sections/footer-with-newsletter-form-categories-and-social-icons'
import type { Industry } from '@/lib/industries'
import { site } from '@/lib/site'

function StatusBadge({ industry }: { industry: Industry }) {
  const label =
    industry.statusLabel ??
    (industry.status === 'shipped'
      ? 'Shipped samples'
      : industry.status === 'partial'
        ? 'Partial — samples shipping'
        : 'Planned vertical')
  return (
    <span className="inline-flex rounded-full bg-mist-950/5 px-3 py-1 text-xs font-medium tracking-wide text-mist-600 uppercase dark:bg-white/10 dark:text-mist-300">
      {label}
    </span>
  )
}

function DisclaimerNotice({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-4 text-sm/7 text-mist-700 dark:text-mist-300">
      {text}
    </div>
  )
}

function ctaSubheadline(industry: Industry) {
  if (industry.status === 'partial' || industry.status === 'shipped') {
    return (
      <p>
        Self-host the {industry.name.toLowerCase()} compose stack today, or join the managed waitlist for hosted MCP,
        vault, and IDP tailored to {industry.name.toLowerCase()} workflows. {site.waitlistPromise}
      </p>
    )
  }
  return (
    <p>
      Join the waitlist to get notified when {industry.packageName} ships — or self-host ClawQL Core with the IDP
      pipeline and vault today. {site.waitlistPromise}
    </p>
  )
}

function PlannedIndustryStub({ industry }: { industry: Industry }) {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={<StatusBadge industry={industry} />}
        headline={industry.headline}
        subheadline={<p>{industry.subheadline}</p>}
      />

      <Section id="overview" eyebrow="Status" headline={`${industry.name} vertical — on the roadmap`}>
        <p className="max-w-3xl text-sm/7 text-mist-700 dark:text-mist-400">{industry.overview}</p>
        <p className="mt-4 max-w-3xl text-sm/7 text-mist-600 dark:text-mist-500">
          Lending is the most developed vertical today — with W-2 intake, HITL review, and a shipped Docker Compose
          stack. Other industries share the same ClawQL Core (search, execute, memory, IDP) and will register domain
          tools via modularization v2.1 as each package ships.
        </p>
      </Section>

      <Section
        id="notify"
        eyebrow="Get notified"
        headline={`Notify me when ${industry.name.toLowerCase()} ships`}
        subheadline={
          <p>
            Leave your email and mention &ldquo;{industry.name}&rdquo; in the message — we&apos;ll reach out when{' '}
            {industry.packageName} enters early access.
          </p>
        }
      >
        <NewsletterForm
          headline="Vertical waitlist"
          subheadline={<p>{site.waitlistPromise}</p>}
          source="footer"
          className="max-w-md"
        />
      </Section>

      <CallToActionSimple
        id="cta"
        headline="Need lending or document automation today?"
        subheadline={
          <p>
            Explore the lending vertical or self-host ClawQL Core with the full IDP pipeline while {industry.name}{' '}
            tools are in development.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ButtonLink href="/industries/lending" size="lg">
              View lending vertical
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/vision/modularization`} size="lg">
              Modularization roadmap <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}

export function IndustryPage({ industry }: { industry: Industry }) {
  if (industry.status === 'planned') {
    return <PlannedIndustryStub industry={industry} />
  }

  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={<StatusBadge industry={industry} />}
        headline={industry.headline}
        subheadline={<p>{industry.subheadline}</p>}
        cta={
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ButtonLink href={site.urls.signup} size="lg">
              Talk to us about {industry.name.toLowerCase()}
            </ButtonLink>
            <PlainButtonLink href={industry.docsHref} size="lg">
              Technical docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />

      {industry.disclaimer ? (
        <section className="pb-8">
          <div className="px-6">
            <DisclaimerNotice text={industry.disclaimer} />
          </div>
        </section>
      ) : null}

      <Section id="overview" eyebrow="Overview" headline={`ClawQL for ${industry.name.toLowerCase()}`}>
        <p className="max-w-3xl text-sm/7 text-mist-700 dark:text-mist-400">{industry.overview}</p>
        {industry.productionReference ? (
          <p className="mt-4 max-w-3xl text-sm/7 text-mist-600 dark:text-mist-500">{industry.productionReference}</p>
        ) : null}
      </Section>

      <Section
        id="pain-points"
        eyebrow="Challenges"
        headline="Problems agents solve in this vertical"
        subheadline={
          <p>
            These are the operational friction points {industry.packageName} targets — on top of ClawQL Core search,
            execute, memory, audit, and the IDP pipeline.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {industry.painPoints.map((point) => (
            <div key={point.title} className="flex flex-col gap-3 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{point.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{point.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="platform"
        eyebrow="Platform"
        headline="Shared ClawQL capabilities"
        subheadline={<p>Every vertical package composes these horizontal layers — security, memory, and document intelligence.</p>}
      >
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {industry.platformCapabilities.map((item) => (
            <li
              key={item}
              className="flex gap-3 rounded-xl bg-mist-950/2.5 p-4 text-sm/7 text-mist-700 dark:bg-white/5 dark:text-mist-400"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mist-400 dark:bg-mist-500" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="domain-tools"
        eyebrow="Domain tools"
        headline={`Tools from ${industry.packageName}`}
        subheadline={
          <p>
            Planned or shipping MCP tools from{' '}
            <Link href="https://docs.clawql.com/vision/modularization">modularization v2.1</Link> — registered when the
            vertical package is enabled via <code className="text-sm">CLAWQL_ENABLE_*</code> or Operator flags.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {industry.domainTools.map((tool) => (
            <div key={tool.name} className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-5 dark:bg-white/5">
              <code className="text-sm font-semibold text-mist-900 dark:text-mist-100">{tool.name}()</code>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{tool.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="documents"
        eyebrow="Document types"
        headline="What the IDP pipeline processes"
        subheadline={<p>Representative inputs agents classify, extract, redact, and archive in this vertical.</p>}
      >
        <ul className="flex flex-wrap gap-2">
          {industry.documentTypes.map((docType) => (
            <li
              key={docType}
              className="rounded-full bg-mist-950/5 px-4 py-2 text-sm font-medium text-mist-700 dark:bg-white/10 dark:text-mist-300"
            >
              {docType}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="use-cases"
        eyebrow="Use cases"
        headline={`Why ClawQL for ${industry.name.toLowerCase()}`}
        subheadline={
          <p>
            Vertical packages extend the same MCP gateway — search, execute, memory, IDP, audit — with domain tools from{' '}
            <code className="text-sm">{industry.packageName}</code>.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {industry.useCases.map((useCase) => (
            <div key={useCase.title} className="flex flex-col gap-3 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{useCase.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{useCase.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="examples"
        eyebrow="Examples"
        headline="Example agent workflows"
        subheadline={
          <p>
            Representative MCP tool sequences with step-by-step detail — production deployments add tenant classifiers,
            RBAC, and your compliance policies on top.
          </p>
        }
      >
        <div className="flex flex-col gap-6">
          {industry.examples.map((example) => (
            <article
              key={example.title}
              className="flex flex-col gap-5 rounded-xl bg-mist-950/2.5 p-6 sm:p-8 dark:bg-white/5"
            >
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-wide text-mist-500 uppercase dark:text-mist-400">
                  {example.summary}
                </p>
                <h3 className="text-base font-semibold text-mist-950 dark:text-white">{example.title}</h3>
                <p className="text-sm/7 text-mist-700 dark:text-mist-400">{example.body}</p>
              </div>
              <ol className="flex flex-col gap-3 border-l border-mist-950/10 pl-5 dark:border-white/10">
                {example.steps.map((step, index) => (
                  <li key={step.label} className="relative flex flex-col gap-1">
                    <span className="absolute -left-[1.375rem] flex size-5 items-center justify-center rounded-full bg-mist-950/10 text-xs font-semibold text-mist-600 dark:bg-white/10 dark:text-mist-300">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-mist-950 dark:text-white">{step.label}</span>
                    <span className="text-sm/7 text-mist-700 dark:text-mist-400">{step.detail}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                {example.tools.map((tool) => (
                  <code
                    key={tool}
                    className="rounded-md bg-mist-950/5 px-2 py-1 text-xs font-semibold text-mist-800 dark:bg-white/10 dark:text-mist-200"
                  >
                    {tool}()
                  </code>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="compliance"
        eyebrow="Security & compliance"
        headline="Built for regulated workflows"
        subheadline={
          <p>
            Industry pages summarize platform capabilities — your legal, compliance, and security teams should review{' '}
            <Link href={`${site.urls.docs}/security`}>docs.clawql.com/security</Link> before production data.
          </p>
        }
      >
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {industry.compliance.map((item) => (
            <li
              key={item}
              className="flex gap-3 rounded-xl bg-mist-950/2.5 p-4 text-sm/7 text-mist-700 dark:bg-white/5 dark:text-mist-400"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mist-400 dark:bg-mist-500" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      {industry.relatedResources.length > 0 ? (
        <Section id="resources" eyebrow="Resources" headline="Related documentation">
          <ul className="flex flex-col gap-3">
            {industry.relatedResources.map((resource) => (
              <li key={resource.href}>
                <Link href={resource.href} className="text-sm font-medium">
                  {resource.label} <ArrowNarrowRightIcon />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <CallToActionSimple
        id="cta"
        headline={`Ready to pilot ClawQL in ${industry.name.toLowerCase()}?`}
        subheadline={ctaSubheadline(industry)}
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Join waitlist
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/vision/modularization`} size="lg">
              Modularization roadmap <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
