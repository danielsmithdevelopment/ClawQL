import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/case-studies/cloudflare-docs-mcp` (h2 ids match @sindresorhus/slugify). */
export const caseStudyCloudflareDocsSections: Array<Section> = [
  {
    title: '1. Why this project is a stress test',
    id: '1-why-this-project-is-a-stress-test',
  },
  {
    title: '2. Mental model: account, zone, Worker, hostname',
    id: '2-mental-model-account-zone-worker-hostname',
  },
  { title: '3. Goals', id: '3-goals' },
  { title: '4. Environment and stack', id: '4-environment-and-stack' },
  {
    title: '5. Wrangler deploy vs REST `execute`',
    id: '5-wrangler-deploy-vs-rest-execute',
  },
  {
    title: '6. Deploy script and custom domain',
    id: '6-deploy-script-and-custom-domain',
  },
  {
    title: '7. How the four tools worked together',
    id: '7-how-the-four-tools-worked-together',
  },
  {
    title: '8. End-to-end workflow (chronological)',
    id: '8-end-to-end-workflow-chronological',
  },
  { title: '9. Failures and symptoms', id: '9-failures-and-symptoms' },
  { title: '10. Fixes and verification', id: '10-fixes-and-verification' },
  {
    title: '11. Caching headers and purge',
    id: '11-caching-headers-and-purge',
  },
  {
    title: '12. Insights for future work',
    id: '12-insights-for-future-work',
  },
  { title: '13. References', id: '13-references' },
]
