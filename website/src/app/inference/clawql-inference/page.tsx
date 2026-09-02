import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-inference — Agentic Gateway entry',
  description:
    'Agentic Gateway reference: OpenAI-compatible /v1, MCP path to Auditable Production AI, provider plugins, tier escalation, semantic cache, flywheel, and CLI.',
  path: '/inference/clawql-inference',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlInferencePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          Inference
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Agentic Gateway + model-improvement flywheel.</strong>{' '}
          <a
            href="/getting-started/inference"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Get started (five-minute runbook)
          </a>
          . Fabric context:{' '}
          <a
            href="/architecture/agentic-fabric"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Zero-Trust Agentic Fabric
          </a>
          . Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/inference/clawql-inference.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/inference/clawql-inference.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Provider plugins:{' '}
          <a
            href="/plugins/inference-providers"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Inference providers
          </a>
          . Token cache layer:{' '}
          <a
            href="/architecture/token-efficiency"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Token efficiency
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/inference/clawql-inference"
        className="flex-auto"
      />
    </article>
  )
}
