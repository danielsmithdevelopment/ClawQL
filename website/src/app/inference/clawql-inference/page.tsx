import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import InferenceBody from '@/generated/clawql-inference-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-inference — gateway, flywheel, and wiring',
  description:
    'Complete reference for ClawQL inference: OpenAI-compatible gateway, provider plugins, tier escalation, semantic cache, fallback chains, virtual keys, call store, export/finetune flywheel, Ouroboros audit, and CLI.',
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
        <Tag color="sky" variant="medium">
          Shipped
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Gateway + model-improvement flywheel.</strong> Generated from{' '}
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

      <DocProse className="flex-auto">
        <InferenceBody />
      </DocProse>
    </article>
  )
}
