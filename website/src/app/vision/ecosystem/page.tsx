import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import EcosystemBody from '@/generated/clawql-ecosystem-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Ecosystem — Vision & Shipped vs Roadmap',
  description:
    'North-star narrative for the ClawQL platform: core MCP loop, hybrid memory, IDP pipeline, Onyx, Ouroboros, infra map, and appendix separating fiction from shipped behavior.',
  path: '/vision/ecosystem',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function VisionEcosystemPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Vision
        </Tag>
        <Tag color="claw" variant="medium">
          Ecosystem
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Product surface map.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/clawql-ecosystem.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/clawql-ecosystem.md
          </a>
          . Mechanics and env flags:{' '}
          <a
            href="/tools"
            className="font-medium text-inherit underline underline-offset-2"
          >
            MCP tools
          </a>
          ,{' '}
          <a
            href="/spec-configuration"
            className="font-medium text-inherit underline underline-offset-2"
          >
            configuration
          </a>
          .
        </Note>
      </div>

      <DocProse>
        <EcosystemBody />
      </DocProse>
    </article>
  )
}
