import type { Metadata } from 'next'
import Link from 'next/link'

import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: 'GTM playbook — not public',
  description: 'Internal GTM material is not published on the public site.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Not published</h1>
      <p className="mt-4 text-mist-700 dark:text-mist-300">
        Internal go-to-market playbooks are not part of the public ClawQL site. For product docs see{' '}
        <Link className="underline" href={site.urls.docs}>
          docs.clawql.com
        </Link>{' '}
        or return to the{' '}
        <Link className="underline" href={site.urls.home}>
          home page
        </Link>
        .
      </p>
    </main>
  )
}
