import { ButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { industries } from '@/lib/industries'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

function statusLabel(status: (typeof industries)[number]['status'], custom?: string) {
  if (custom) return custom
  if (status === 'shipped') return 'Available'
  if (status === 'partial') return 'In progress'
  return 'Planned'
}

export const metadata = pageMetadata({
  title: 'Industries',
  description:
    'ClawQL vertical packages for lending, real estate, surveillance, healthcare, and more — agent-native document, audit, and API workflows on one Agentic Gateway.',
  path: '/industries',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow="Industry verticals"
        headline="One Agentic Gateway. Domain-specific workflows."
        subheadline={
          <p>
            ClawQL modularization v2.1 defines opt-in vertical packages that share security, memory, audit, and the IDP
            pipeline. <strong>Lending</strong>, <strong>real estate</strong>, and <strong>surveillance</strong> have
            shipping reference surfaces today; healthcare, legal, and insurance are on the roadmap.
          </p>
        }
        cta={
          <ButtonLink href={`${site.urls.docs}/vision/modularization`} size="lg">
            Read modularization v2.1
          </ButtonLink>
        }
      />

      <Section id="industries" headline="Explore by industry">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry) => (
            <article
              key={industry.slug}
              className="flex flex-col justify-between gap-6 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">
                    {industry.packageName}
                  </p>
                  <span className="rounded-full bg-mist-950/5 px-2 py-0.5 text-xs font-medium text-mist-600 dark:bg-white/10 dark:text-mist-300">
                    {statusLabel(industry.status, industry.statusLabel)}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-mist-950 dark:text-white">{industry.name}</h2>
                <p className="text-sm/7 text-mist-700 dark:text-mist-400">{industry.headline}</p>
                <p className="line-clamp-3 text-sm/7 text-mist-600 dark:text-mist-600">{industry.overview}</p>
              </div>
              <Link href={`/industries/${industry.slug}`}>
                {industry.status === 'planned' ? 'Notify me when it ships' : 'View use cases'} <ArrowNarrowRightIcon />
              </Link>
            </article>
          ))}
        </div>
      </Section>
    </>
  )
}
