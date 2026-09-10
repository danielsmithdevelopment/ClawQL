import { AgentsLanding } from '@/components/sections/agents-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Agentic Platform',
  absoluteTitle: 'Agentic Platform · ClawQL',
  description:
    'ClawQL agents decide when to act, enumerate institutional knowledge exactly, scaffold their own browser interfaces, and prove everything they did. Mechanism-proven on OpenBench mini-firm (B-7). Powered by ClawQL.',
  path: '/agents',
})

export default function Page() {
  return <AgentsLanding />
}
