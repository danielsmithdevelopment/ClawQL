'use client'

import dynamic from 'next/dynamic'

/** Client-only island: avoids SSR + RSC serialization cost for Headless UI feedback on long MDX pages. */
const FeedbackLazy = dynamic(
  () => import('@/components/Feedback').then((m) => ({ default: m.Feedback })),
  {
    ssr: false,
    loading: () => <div className="relative h-8" aria-hidden />,
  },
)

export function FeedbackClientIsland() {
  return <FeedbackLazy />
}
