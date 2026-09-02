import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-agents — hardened open-source agent adapters',
  description:
    'Seven agent adapters (OpenClaw, Hermes, Pi, Goose, DeepSeek Harness, OpenHands, Cline) with Panguard, WORM hooks, vault memory, Helm overlays, and dry OpenBench runner.',
  path: '/agents/clawql-agents',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlAgentsSpecPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Agents
        </Tag>
        <Tag color="amber" variant="medium">
          v0.1
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>
            Wraps open-source agents — does not ship the agents themselves.
          </strong>{' '}
          Adapters wire ClawQL MCP tools, Panguard ATR, and WORM audit into each
          agent family. Durable trail:{' '}
          <a
            href="/audit"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-audit
          </a>
          . Personal setup:{' '}
          <a
            href="/agent-setup"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Agent setup
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/agents/clawql-agents-spec-v0.1.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/agents/clawql-agents-spec-v0.1.md
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody
        path="/agents/clawql-agents"
        className="flex-auto"
      />
    </article>
  )
}
