'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { useAgentLabStore } from '@/lib/webmcp-agent-lab-store'
import { claimStarterPackDownloads } from '@/lib/webmcp-starter-pack'

const SAMPLE_PROMPTS = [
  'Search the ClawQL docs for celld and summarize Lab 5b.',
  'List hub routes, then navigate to /learn/memory and list sections.',
  'Reveal the agent lab, claim the starter pack, and explain where secrets go.',
  'On /plugins, filter horizontal plugins for memory and open the memory plugin.',
]

const TOOL_ROWS: Array<{ name: string; blurb: string }> = [
  { name: 'clawql.docs.search', blurb: 'Full-text docs search' },
  { name: 'clawql.docs.list_routes', blurb: 'Curated hub map' },
  { name: 'clawql.docs.list_sections', blurb: 'Page TOC / heading ids' },
  { name: 'clawql.docs.get_page_markdown', blurb: 'Agent markdown body' },
  { name: 'clawql.docs.navigate', blurb: 'Same-origin navigation' },
  { name: 'clawql.docs.reveal_agent_lab', blurb: 'Unlock this panel' },
  { name: 'clawql.docs.claim_starter_pack', blurb: 'Download mcp.json + README' },
]

/**
 * Hidden until WebMCP `reveal_agent_lab` (or a prior unlock in localStorage).
 * Mirrors the Cloudflare challenge “tool unlocks a second surface” pattern.
 */
export function WebMcpAgentLab() {
  const open = useAgentLabStore((s) => s.open)
  const unlocked = useAgentLabStore((s) => s.unlocked)
  const claimedAt = useAgentLabStore((s) => s.claimedAt)
  const hydrate = useAgentLabStore((s) => s.hydrate)
  const close = useAgentLabStore((s) => s.close)
  const markClaimed = useAgentLabStore((s) => s.markClaimed)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    const api = {
      reveal: () => useAgentLabStore.getState().reveal(),
      claim: () => {
        useAgentLabStore.getState().reveal()
        const pack = claimStarterPackDownloads()
        useAgentLabStore.getState().markClaimed()
        return pack
      },
      close: () => useAgentLabStore.getState().close(),
    }
    ;(
      window as unknown as { clawqlDocsAgentLab?: typeof api }
    ).clawqlDocsAgentLab = api
    return () => {
      delete (window as unknown as { clawqlDocsAgentLab?: typeof api })
        .clawqlDocsAgentLab
    }
  }, [])

  if (!open || !unlocked) return null

  return (
    <aside
      id="clawql-agent-lab"
      role="dialog"
      aria-modal="false"
      aria-labelledby="clawql-agent-lab-title"
      className="fixed right-4 bottom-4 z-[90] flex max-h-[min(85vh,40rem)] w-[min(100%-2rem,26rem)] flex-col overflow-hidden rounded-xl border border-zinc-900/15 bg-claw-warm-white shadow-xl dark:border-claw-graph/50 dark:bg-claw-bg"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-900/10 px-4 py-3 dark:border-white/10">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-zinc-500 uppercase dark:text-zinc-400">
            WebMCP unlocked
          </p>
          <h2
            id="clawql-agent-lab-title"
            className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-white"
          >
            ClawQL Agent Lab
          </h2>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded-md px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-900/5 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:outline-claw-cyan-bright"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          This panel stays hidden for normal browsing. An agent calling{' '}
          <code className="font-mono text-[0.8em]">clawql.docs.reveal_agent_lab</code>{' '}
          reveals it — same pattern as Cloudflare’s challenge coupon unlock.
        </p>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Docs WebMCP tools
          </h3>
          <ul className="mt-2 space-y-1.5">
            {TOOL_ROWS.map((row) => (
              <li key={row.name} className="flex flex-col gap-0.5">
                <code className="font-mono text-[0.72rem] text-zinc-900 dark:text-claw-cyan-bright">
                  {row.name}
                </code>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {row.blurb}
                </span>
              </li>
            ))}
            <li className="text-xs text-zinc-500 dark:text-zinc-400">
              On <code className="font-mono">/plugins*</code>: filter + open
              registry tools.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Sample prompts
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs">
            {SAMPLE_PROMPTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Test in Chrome
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs">
            <li>
              Enable{' '}
              <code className="font-mono">
                chrome://flags/#enable-webmcp-testing
              </code>
            </li>
            <li>Install the Model Context Tool Inspector extension</li>
            <li>
              Call <code className="font-mono">reveal_agent_lab</code> then{' '}
              <code className="font-mono">claim_starter_pack</code>
            </li>
          </ol>
        </section>

        <section className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <Link
            href="/quickstart"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            Quickstart
          </Link>
          <Link
            href="/agent-setup"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            Agent setup
          </Link>
          <Link
            href="/learn/memory"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            Memory
          </Link>
          <Link
            href="/mcp/mcp-ui"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-claw-cyan-bright"
          >
            MCP-UI
          </Link>
        </section>

        {claimedAt ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Starter pack claimed {new Date(claimedAt).toLocaleString()}.
          </p>
        ) : null}
      </div>

      <div className="border-t border-zinc-900/10 px-4 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => {
            claimStarterPackDownloads()
            markClaimed()
          }}
          className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan dark:bg-claw-cyan dark:text-claw-bg dark:hover:bg-claw-cyan-bright dark:focus-visible:outline-claw-cyan-bright"
        >
          Download starter pack
        </button>
      </div>
    </aside>
  )
}
