import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/sandbox-exec` (h2 ids match @sindresorhus/slugify). */
export const learnSandboxExecSections: Array<Section> = [
  { title: 'What sandbox_exec is for', id: 'what-sandbox-exec-is-for' },
  {
    title: 'Enable the tool and pick a backend',
    id: 'enable-the-tool-and-pick-a-backend',
  },
  {
    title: 'macOS Seatbelt local isolation',
    id: 'mac-os-seatbelt-local-isolation',
  },
  { title: 'Docker and Podman containers', id: 'docker-and-podman-containers' },
  { title: 'Cloudflare Workers bridge', id: 'cloudflare-workers-bridge' },
  { title: 'How to choose a backend', id: 'how-to-choose-a-backend' },
  {
    title: 'Tool input sessions and timeouts',
    id: 'tool-input-sessions-and-timeouts',
  },
  { title: 'Benefits and security limits', id: 'benefits-and-security-limits' },
  {
    title: 'Related guides and references',
    id: 'related-guides-and-references',
  },
]
