import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import AgentSetupBody from '@/generated/agent-setup-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Agent setup',
  description:
    'Vault-first ClawQL onboarding for desktop MCP clients, Cursor iOS Cloud Agents with team vault sync, and the fail-closed local agent sandbox (macOS Seatbelt).',
  path: '/agent-setup',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function AgentSetupPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Agents
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Desktop, iOS, and laptop sandbox.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/agent-setup.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/agent-setup.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Related:{' '}
          <a
            href="/getting-started/for-teams#team-vault-sync"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Team vault sync
          </a>
          ·{' '}
          <a
            href="/mcp-clients"
            className="font-medium text-inherit underline underline-offset-2"
          >
            MCP clients
          </a>
          ·{' '}
          <a
            href="/learn/sandbox-exec"
            className="font-medium text-inherit underline underline-offset-2"
          >
            sandbox_exec
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <AgentSetupBody />
      </Prose>
    </article>
  )
}
