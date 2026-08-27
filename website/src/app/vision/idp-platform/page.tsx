import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'IDP Platform — Intelligent Document Processing',
  description:
    'ClawQL IDP Platform: self-hosted vs managed hosted deployment, ClawQL-native archive layer, pdf-inspector route + eight-vendor pipeline (Docling through Coneshare), classify/LangExtract MCP tools, Coneshare VDR, Merkle audit trails, and competitive positioning.',
  path: '/vision/idp-platform',
  ogType: 'article',
})

/** Full MDX is bundled into this route at build time for crawlers and link previews. */
export const dynamic = 'force-static'

export default function VisionIdpPlatformPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vision
        </Tag>
        <Tag color="claw" variant="medium">
          IDP · April 2026
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Canonical IDP product design.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-idp-platform.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/vision/clawql-idp-platform.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Operator
          walkthrough:{' '}
          <a
            href="/learn/document-pipeline"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Document pipeline
          </a>
          . Engineering tracker:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/roadmap/idp-master-requirements-matrix.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            IDP requirements matrix
          </a>
          . OpenClaw contract:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/openclaw/openclaw-idp-skill-profile.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            IDP skill profile
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/vision/idp-platform" className="flex-auto" />
    </article>
  )
}
