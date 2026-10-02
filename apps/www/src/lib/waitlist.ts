import { site } from '@/lib/site'

/** Inbox for waitlist notifications — forwarded by FormSubmit on submit. */
export const waitlistNotifyEmail = 'hello@clawql.com'

/** FormSubmit endpoint (static-site friendly; no backend required). */
export const waitlistFormAction = `https://formsubmit.co/${waitlistNotifyEmail}`

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clawql.com'

export const waitlistThanksUrl = `${siteOrigin}${basePath}${site.urls.signup}/thanks/`

export type WaitlistSource = 'signup-page' | 'footer' | 'homepage'

export function waitlistSubject(source: WaitlistSource): string {
  switch (source) {
    case 'signup-page':
      return 'ClawQL managed waitlist signup'
    case 'footer':
      return 'ClawQL waitlist (footer)'
    case 'homepage':
      return 'ClawQL waitlist (homepage)'
  }
}
