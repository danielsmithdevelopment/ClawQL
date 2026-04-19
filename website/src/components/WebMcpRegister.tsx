'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Registers WebMCP tools via `navigator.modelContext.registerTool()` so browser agents
 * can navigate and read context on the docs site (secure context only).
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */
export function WebMcpRegister() {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mc = navigator.modelContext
    if (!mc || typeof mc.registerTool !== 'function') return

    const ac = new AbortController()
    const { signal } = ac

    const tools = [
      {
        name: 'clawql.docs.navigate',
        title: 'Navigate ClawQL docs',
        description:
          'Navigate to a page on this documentation site. Use paths like /tools, /install, /deployment, or /spec-configuration. Only same-origin relative paths are allowed.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
              description:
                'Absolute path on this site, starting with / (e.g. /mcp-clients)',
            },
          },
          required: ['path'],
        },
        annotations: { readOnlyHint: false },
        async execute(input: object) {
          const raw = input as { path?: string }
          const path = String(raw.path ?? '')
          if (!path.startsWith('/') || path.startsWith('//')) {
            return {
              ok: false,
              error: 'Path must be a same-origin path starting with /',
            }
          }
          router.push(path)
          return { ok: true, path }
        },
      },
      {
        name: 'clawql.docs.page_context',
        title: 'Current documentation page',
        description:
          'Returns the active page pathname, document title, and full URL. Use to ground answers in what the user is viewing.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        annotations: { readOnlyHint: true },
        async execute(_input: object) {
          return {
            pathname: pathnameRef.current,
            title: document.title,
            href: window.location.href,
          }
        },
      },
      {
        name: 'clawql.docs.scroll_to_section',
        title: 'Scroll to page section',
        description:
          'Scrolls the main view to a heading or section with the given HTML id (e.g. from the on-page table of contents).',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            id: {
              type: 'string',
              description: 'The id attribute of the target element (without #)',
            },
          },
          required: ['id'],
        },
        annotations: { readOnlyHint: true },
        async execute(input: object) {
          const raw = input as { id?: string }
          let id = String(raw.id ?? '').trim()
          if (id.startsWith('#')) id = id.slice(1)
          if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            return { ok: false, error: 'Invalid id' }
          }
          const el = document.getElementById(id)
          if (!el) {
            return { ok: false, error: 'No element with that id' }
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return { ok: true, id }
        },
      },
    ]

    for (const tool of tools) {
      try {
        mc.registerTool(tool, { signal })
      } catch (err) {
        console.warn('[WebMCP] registerTool failed:', tool.name, err)
      }
    }

    return () => {
      ac.abort()
    }
  }, [router])

  return null
}
