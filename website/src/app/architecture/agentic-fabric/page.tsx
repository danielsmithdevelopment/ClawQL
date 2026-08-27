import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'Zero-Trust Agentic Fabric',
  description:
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, and Edge swarm.',
  path: '/architecture/agentic-fabric',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function AgenticFabricPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Architecture
        </Tag>
        <Tag color="claw" variant="medium">
          GTM
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Canonical enterprise topology.</strong> Product layers (IDP
          stack, packages, Operator tiers) describe what ships inside the
          platform. This page describes how enterprises deploy and govern it.
          Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/zero-trust-agentic-fabric.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/architecture/zero-trust-agentic-fabric.md
          </a>
          . Primary marketing motion:{' '}
          <a
            href="https://clawql.com/inference/gtm/"
            className="font-medium text-inherit underline underline-offset-2"
          >
            inference-first GTM
          </a>
          .
        </Note>
      </div>

      <Prose>
        <AgentMarkdownDocBody path="/architecture/agentic-fabric" />
      </Prose>
    </article>
  )
}
