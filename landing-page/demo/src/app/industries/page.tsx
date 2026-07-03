import { ButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { Section } from '@/components/elements/section'
import { industries } from '@/lib/industries'
import { site } from '@/lib/site'

export const metadata = {
  title: 'Industries',
  description:
    'ClawQL vertical packages for lending, real estate, healthcare, and more — agent-native document and API workflows on one MCP gateway.',
}

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow="Industry verticals"
        headline="One gateway. Domain-specific workflows."
        subheadline={
          <p>
            ClawQL modularization v2.1 defines opt-in vertical packages — lending, healthcare, legal, insurance, and
            more — that share security, memory, audit, and the IDP pipeline. These pages explain the first industries we
            are targeting.
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
                <p className="text-xs font-medium tracking-wide text-mist-500 uppercase dark:text-mist-400">
                  {industry.packageName}
                </p>
                <h2 className="text-base font-semibold text-mist-950 dark:text-white">{industry.name}</h2>
                <p className="text-sm/7 text-mist-700 dark:text-mist-400">{industry.headline}</p>
              </div>
              <Link href={`/industries/${industry.slug}`}>
                View use cases <ArrowNarrowRightIcon />
              </Link>
            </article>
          ))}
        </div>
      </Section>
    </>
  )
}
