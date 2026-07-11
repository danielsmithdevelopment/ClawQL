import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import LocalAgentSandboxBody from '@/generated/local-agent-sandbox-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Local agent sandbox',
  description:
    'Fail-closed macOS Seatbelt containment for Codex, Claude, Cursor, and OpenCode — clawql sandbox init, per-harness profiles, and kernel-level write blocking.',
  path: '/getting-started/local-agent-sandbox',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function LocalAgentSandboxPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Seatbelt
        </Tag>
        <Tag color="rose" variant="medium">
          Fail-closed
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Developer laptop containment.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/local-agent-sandbox.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/local-agent-sandbox.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. MCP snippets:{' '}
          <a
            href="/learn/sandbox-exec"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Sandbox exec
          </a>
          · Plugin:{' '}
          <a
            href="/plugins/sandbox"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Sandbox
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <LocalAgentSandboxBody />
      </Prose>
    </article>
  )
}
