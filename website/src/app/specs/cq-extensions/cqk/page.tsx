import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: '.cqk — Provenanced knowledge',
  description: 'Draft spec for ClawQL provenanced knowledge entries (.cqk).',
  path: '/specs/cq-extensions/cqk',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function Page() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          .cqk
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
        <AgentMarkdownDocBody path="/specs/cq-extensions/cqk" />
      </Prose>
    </article>
  )
}
