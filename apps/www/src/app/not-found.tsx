import { Link } from '@/components/elements/link'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { site } from '@/lib/site'

export default function NotFound() {
  return (
    <HeroSimpleCentered
      headline="Page not found"
      subheadline={
        <p>
          That path is not on clawql.com. Try the{' '}
          <Link href="/">home page</Link>, <Link href="/llms.txt">llms.txt</Link>, or{' '}
          <a href={site.urls.docs}>docs.clawql.com</a>.
        </p>
      }
      cta={
        <Link href="/">
          Go back home <ArrowNarrowRightIcon />
        </Link>
      }
    />
  )
}
