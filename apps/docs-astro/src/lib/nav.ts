/**
 * Starter sidebar for the Astro docs migration (ADR 0018).
 * Expand toward parity with apps/docs/src/lib/docs-nav-data.ts as pages land.
 */

export type NavLink = {
  title: string
  href: string
  tag?: string
}

export type NavGroup = {
  title: string
  links: NavLink[]
}

/** Routes that already have content in apps/docs-astro. */
export const docsNavigation: NavGroup[] = [
  {
    title: 'Getting started',
    links: [
      { title: 'Home', href: '/' },
      { title: 'Quickstart', href: '/quickstart' },
      { title: 'Migration status', href: '/migration-status' },
    ],
  },
]
