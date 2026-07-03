import { ButtonLink } from '@/components/elements/button'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { site } from '@/lib/site'

export const metadata = {
  title: 'You’re on the list',
}

export default function Page() {
  return (
    <HeroSimpleCentered
      id="signup-thanks"
      headline="Thanks — we got your signup."
      subheadline={
        <p>
          We’ll review your request and reach out from hello@clawql.com when managed hosting slots open. In the
          meantime, you can self-host ClawQL today with the open-source MCP server.
        </p>
      }
      cta={
        <div className="flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href={site.urls.docs}>Read the docs</ButtonLink>
          <ButtonLink href={site.urls.home} color="light">
            Back to home
          </ButtonLink>
        </div>
      }
    />
  )
}
