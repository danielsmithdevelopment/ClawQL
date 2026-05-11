import type { ReactNode } from 'react'

/**
 * Long-form MDX case studies are the hottest Worker CPU path on Cloudflare Free
 * (10ms CPU / invocation). Keep this segment fully static at build time; pair
 * with longer `s-maxage` for `/case-studies/*` in `next.config.mjs` + `public/_headers`.
 */
export const dynamic = 'force-static'

export default function CaseStudiesLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
