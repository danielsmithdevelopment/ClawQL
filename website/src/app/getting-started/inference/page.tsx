import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import GettingStartedInferenceBody from '@/generated/getting-started-inference-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Get started with clawql-inference',
  description:
    'Five-minute path to clawql-inference: OpenAI-compatible /v1, direct BYOK providers, optional OpenRouter, MCP + memory, and security defaults.',
  path: '/getting-started/inference',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function GettingStartedInferencePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Inference
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Start here for clawql-inference.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/inference.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/inference.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Full reference:{' '}
          <a
            href="/inference/clawql-inference"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-inference
          </a>
          . Providers:{' '}
          <a
            href="/plugins/inference-providers"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Inference providers
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <GettingStartedInferenceBody />
      </DocProse>
    </article>
  )
}
