import { StreamsLanding } from '@/components/sections/streams-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Streams',
  description:
    'ClawQL Streams — event-driven agent sessions with WORM audit, Protocol Fabric, and celld / Cloudflare Durable Object scale. Self-hosted session substrate — not a durable execution engine for agent code.',
  path: '/streams',
})

export default function Page() {
  return <StreamsLanding />
}
