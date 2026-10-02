import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Payments & entitlements (Learn)',
  description:
    'Hands-on guide: plan tiers, Stripe + x402 gates, WORM payment audit, and inference entitlement enforcement with clawql-payments.',
  path: '/learn/payments-and-entitlements',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
