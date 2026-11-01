import curated from './nav.curated.json'

export type NavLink = {
  title: string
  href: string
  tag?: string
}

export type NavGroup = {
  title: string
  links: NavLink[]
}

/** Curated sidebar — same structure/titles as apps/docs `docs-nav-data.ts`. */
export const docsNavigation = curated.docsNavigation as NavGroup[]

/** Mobile drawer shortcuts (top of sidebar on small screens). */
export const docsMobileShortcuts = curated.docsMobileShortcuts as Array<{
  title: string
  href: string
}>
