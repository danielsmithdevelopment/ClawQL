import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/case-studies/cloudflare-docs-mcp`. */
export const caseStudyCloudflareDocsSections: Array<Section> = [
  { title: 'Goals', id: 'goals' },
  {
    title: 'Why Workers are a stress test for Next.js',
    id: 'why-workers-are-a-stress-test-for-next-js',
  },
  {
    title: 'Mental model: account, zone, Worker, hostname',
    id: 'mental-model-account-zone-worker-hostname',
  },
  { title: 'Environment and stack', id: 'environment-and-stack' },
  { title: 'Wrangler vs REST execute', id: 'wrangler-vs-rest-execute' },
  {
    title: 'Deploy script and custom domain',
    id: 'deploy-script-and-custom-domain',
  },
  { title: 'Four tools', id: 'how-the-four-tools-worked-together' },
  { title: 'Workflow', id: 'end-to-end-workflow' },
  { title: 'Failures', id: 'failures-and-symptoms' },
  { title: 'Fixes', id: 'fixes-and-verification' },
  { title: 'Caching', id: 'caching-headers-and-purge' },
  { title: 'Insights', id: 'insights-for-future-work' },
  { title: 'References', id: 'references' },
]
