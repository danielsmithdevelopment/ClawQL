import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import CursorIosCloudAgentBody from '@/generated/cursor-ios-cloud-agent-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Cursor iOS + Cloud Agent',
  description:
    'Connect ClawQL from the Cursor iOS app via Cloud Agents — stdio MCP on the agent VM, team vault sync (R2/S3/GCS), and memory_sync between sessions.',
  path: '/getting-started/cursor-ios-cloud-agent',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function CursorIosCloudAgentPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Cursor iOS
        </Tag>
        <Tag color="rose" variant="medium">
          Cloud Agent
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Mobile + Cloud Agents.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/cursor-ios-cloud-agent.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/cursor-ios-cloud-agent.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Vault sync:{' '}
          <a
            href="/getting-started/team-vault-sync"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Team vault sync
          </a>
          · Setup prompt:{' '}
          <a
            href="/agent-setup"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Agent setup
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <CursorIosCloudAgentBody />
      </Prose>
    </article>
  )
}
