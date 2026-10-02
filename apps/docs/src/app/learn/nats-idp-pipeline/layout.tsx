import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'NATS IDP pipeline (Learn)',
  description:
    'End-to-end Learn guide: Nextcloud inbox webhooks, JetStream workers, run_idp_pipeline, KEDA autoscaling, and the Hermes/Pi agent bridge.',
  path: '/learn/nats-idp-pipeline',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
