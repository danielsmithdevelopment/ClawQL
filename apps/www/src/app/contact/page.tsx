import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Contact',
  description:
    'Contact ClawQL — email hello@clawql.com for product questions, early access, and security. Self-host free with npx clawql-mcp.',
  path: '/contact',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        headline="Contact ClawQL"
        subheadline={
          <p>
            Email{' '}
            <a className="underline decoration-mist-400 underline-offset-4" href="mailto:hello@clawql.com">
              hello@clawql.com
            </a>{' '}
            for product questions, early access, partnerships, and security reports. Self-host anytime with{' '}
            <code className="text-sm">npx clawql-mcp</code>.
          </p>
        }
        cta={
          <Link href="mailto:hello@clawql.com">
            Email hello@clawql.com <ArrowNarrowRightIcon />
          </Link>
        }
      />

      <Section
        id="channels"
        eyebrow="How to reach us"
        headline="Email first — agents can read this page"
        subheadline={
          <p>
            There is no phone queue or walk-in office for early access. Prefer written channels so we can keep an audit
            trail. Markdown twin: <Link href="/contact.md">/contact.md</Link>.
          </p>
        }
      >
        <ul className="mx-auto max-w-2xl space-y-4 text-sm/7 text-mist-700 dark:text-mist-400">
          <li>
            <strong className="text-mist-950 dark:text-white">General / product:</strong>{' '}
            <a href="mailto:hello@clawql.com">hello@clawql.com</a>
          </li>
          <li>
            <strong className="text-mist-950 dark:text-white">Early access waitlist:</strong>{' '}
            <Link href={site.urls.signup}>Sign up</Link>
          </li>
          <li>
            <strong className="text-mist-950 dark:text-white">Docs:</strong>{' '}
            <a href={site.urls.docs}>{site.urls.docs}</a>
          </li>
          <li>
            <strong className="text-mist-950 dark:text-white">GitHub issues:</strong>{' '}
            <a href={`${site.urls.github}/issues`}>{site.urls.github}/issues</a>
          </li>
          <li>
            <strong className="text-mist-950 dark:text-white">Security:</strong>{' '}
            <Link href={site.urls.security}>Security overview</Link> · email hello@clawql.com with subject prefix
            [security]
          </li>
        </ul>
      </Section>

      <CallToActionSimple
        headline="Prefer to run it yourself?"
        subheadline={<p>Apache 2.0 self-host — same MCP tools you will get on managed tiers.</p>}
        cta={
          <Link href={site.urls.docs}>
            Read the docs <ArrowNarrowRightIcon />
          </Link>
        }
      />
    </>
  )
}
