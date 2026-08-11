import { AgentsLanding } from '@/components/sections/agents-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Agentic Platform',
  absoluteTitle: 'Agentic Platform · ClawQL',
  description:
    'ClawQL agents decide when to act, enumerate institutional knowledge exactly, scaffold their own browser interfaces, and prove everything they did. Benchmark-verified on Harvey’s Legal Agent Benchmark.',
  path: '/agents',
})

export default function Page() {
  return <AgentsLanding />
}
