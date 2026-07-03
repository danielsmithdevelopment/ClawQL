import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import type { Industry } from '@/lib/industries'
import { site } from '@/lib/site'

function StatusBadge({ status }: { status: Industry['status'] }) {
  const label =
    status === 'shipped' ? 'Shipped samples' : status === 'partial' ? 'Partial — samples shipping' : 'Planned vertical'
  return (
    <span className="inline-flex rounded-full bg-mist-950/5 px-3 py-1 text-xs font-medium tracking-wide text-mist-600 uppercase dark:bg-white/10 dark:text-mist-300">
      {label}
    </span>
  )
}

export function IndustryPage({ industry }: { industry: Industry }) {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={<StatusBadge status={industry.status} />}
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

      <Section
        id="use-cases"
        eyebrow="Use cases"
        headline={`Why ClawQL for ${industry.name.toLowerCase()}`}
        subheadline={
          <p>
            Vertical packages extend the same MCP gateway — search, execute, memory, IDP, audit — with domain tools from{' '}
            <code className="text-sm">{industry.packageName}</code> in{' '}
            <Link href="https://docs.clawql.com/vision/modularization">modularization v2.1</Link>.
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
            Representative MCP tool sequences — production deployments add tenant classifiers, RBAC, and your compliance
            policies on top.
          </p>
        }
      >
        <div className="flex flex-col gap-4">
          {industry.examples.map((example) => (
            <article
              key={example.title}
              className="flex flex-col gap-4 rounded-xl bg-mist-950/2.5 p-6 sm:p-8 dark:bg-white/5"
            >
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{example.title}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{example.body}</p>
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
            <Link href={`${site.urls.docs}/security`}>docs.clawql.com/security</Link> before production PHI or lending
            data.
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
        {industry.disclaimer ? (
          <p className="mt-6 text-sm/7 text-mist-500 dark:text-mist-400">{industry.disclaimer}</p>
        ) : null}
      </Section>

      <CallToActionSimple
        id="cta"
        headline={`Ready to pilot ClawQL in ${industry.name.toLowerCase()}?`}
        subheadline={
          <p>Self-host the lending compose stack today, or join the managed waitlist for hosted MCP, vault, and IDP.</p>
        }
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
