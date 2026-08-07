import { StreamsLanding } from '@/components/sections/streams-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Streams',
  description:
    'ClawQL Streams — event-driven autonomous agents with WORM audit, Protocol Fabric, and Durable Object scale. The self-sovereign alternative to managed agent runtimes.',
  path: '/streams',
})

export default function Page() {
  return <StreamsLanding />
}
