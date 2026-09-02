import { DocProse } from '@/components/DocProse'
import { loadAgentMarkdownMap } from '@/lib/agent-markdown-loader'
import {
  markdownToHtml,
  type MarkdownToHtmlOptions,
} from '@/lib/markdown-to-html'

type AgentMarkdownDocBodyProps = {
  /** Route key in public/agent-markdown.json (e.g. `/vision/slide-deck`). */
  path: string
  className?: string
  /**
   * Demote markdown `#` headings so the page keeps a single document `<h1>`
   * (WCAG / SEO heading hierarchy).
   */
  demoteH1?: MarkdownToHtmlOptions['demoteH1']
}

/**
 * Renders a synced doc body from Worker ASSETS (`agent-markdown.json`) instead of
 * importing generated `*-body.mdx` into the OpenNext server bundle.
 *
 * Compiled MDX page modules were the tip-over for the free-plan 3 MiB Worker
 * gzip limit; asset-backed markdown keeps full content for HTML/crawlers without
 * shipping those modules in `handler.mjs`.
 */
export async function AgentMarkdownDocBody({
  path,
  className,
  demoteH1,
}: AgentMarkdownDocBodyProps) {
  const map = await loadAgentMarkdownMap()
  const markdown = map[path]
  if (!markdown?.trim()) {
    throw new Error(
      `AgentMarkdownDocBody: no agent-markdown.json entry for path ${path} (re-run node scripts/generate-agent-markdown.mjs)`,
    )
  }
  const html = await markdownToHtml(markdown, { demoteH1 })
  return (
    <DocProse className={className}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </DocProse>
  )
}
