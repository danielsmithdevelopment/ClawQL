'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import {
  CONSOLE_WEBMCP_TOOLS,
  executeConsoleWebMcpTool,
} from '@/lib/webmcp/console-tool-catalog'

/**
 * Registers agent-ready WebMCP tools for the managed ClawQL console.
 *
 * Split preview/prepare from commit: these tools list, inspect, draft, and
 * navigate — they never approve. Approval stays on the Review UI behind a
 * person's security key (no toolautosubmit, no approve tool).
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @see GoogleChromeLabs/webmcp-tools webmcp-skills (annotations + agent-security)
 */
export function WebMcpConsoleRegister() {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mc = document.modelContext ?? navigator.modelContext
    if (!mc || typeof mc.registerTool !== 'function') return

    const ac = new AbortController()
    const { signal } = ac

    for (const tool of CONSOLE_WEBMCP_TOOLS) {
      void Promise.resolve(
        mc.registerTool(
          {
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            ...(tool.annotations ? { annotations: tool.annotations } : {}),
            async execute(input: object) {
              if (tool.name === 'open_review_request') {
                const raw = await executeConsoleWebMcpTool(
                  tool.name,
                  input as Record<string, unknown>,
                )
                try {
                  const parsed = JSON.parse(raw) as { path?: string }
                  if (typeof parsed.path === 'string' && parsed.path.startsWith('/')) {
                    router.push(parsed.path)
                  }
                } catch {
                  /* return raw below */
                }
                return raw
              }
              return executeConsoleWebMcpTool(tool.name, input as Record<string, unknown>)
            },
          },
          { signal },
        ),
      ).catch((err: unknown) => {
        console.warn('[WebMCP] console registerTool failed:', tool.name, err)
      })
    }

    return () => ac.abort()
  }, [router])

  return null
}
