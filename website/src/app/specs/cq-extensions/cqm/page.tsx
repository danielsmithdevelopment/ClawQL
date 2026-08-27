import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: '.cqm — ClawQL Manifest',
  description: 'Draft spec for ClawQL manifest files (.cqm).',
  path: '/specs/cq-extensions/cqm',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function Page() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          .cqm
        </Tag>
      </div>
      <div className="not-prose mb-8">
        <Note>
          Part of{' '}
          <a
            href="/specs/cq-extensions"
            className="font-medium text-inherit underline underline-offset-2"
          >
            .cq* extensions
          </a>
          .
        </Note>
      </div>
      <Prose className="flex-auto">
        <AgentMarkdownDocBody path="/specs/cq-extensions/cqm" />
      </Prose>
    </article>
  )
}
