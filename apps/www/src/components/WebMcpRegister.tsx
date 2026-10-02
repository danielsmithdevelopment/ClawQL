'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Registers WebMCP tools for the ClawQL marketing site (secure context only).
 * @see https://webmachinelearning.github.io/webmcp/
 */
export function WebMcpRegister() {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Chrome 149+ / ChatGPT browser: document.modelContext is canonical.
    // Prefer it so a deprecated navigator stub cannot swallow registration.
    const mc = document.modelContext ?? navigator.modelContext
    if (!mc || typeof mc.registerTool !== 'function') return

    const ac = new AbortController()
    const { signal } = ac

    const tools = [
      {
        name: 'clawql.site.navigate',
        title: 'Navigate ClawQL marketing site',
        description:
          'Navigate to a page on clawql.com. Use paths like /, /pricing, /signup, /about, /industries, or /industries/lending. Only same-origin relative paths are allowed.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path on this site, starting with /',
            },
          },
          required: ['path'],
        },
        annotations: { readOnlyHint: false },
        async execute(input: object) {
          const raw = input as { path?: string }
          const path = String(raw.path ?? '')
          if (!path.startsWith('/') || path.startsWith('//')) {
            return JSON.stringify({ ok: false, error: 'Path must be a same-origin path starting with /' })
          }
          router.push(path)
          return JSON.stringify({ ok: true, path })
        },
      },
      {
        name: 'clawql.site.page_context',
        title: 'Current marketing page',
        description: 'Returns the active pathname, document title, and full URL.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        annotations: { readOnlyHint: true },
        async execute(_input: object) {
          return JSON.stringify({
            pathname: pathnameRef.current,
            title: document.title,
            href: window.location.href,
          })
        },
      },
      {
        name: 'clawql.site.scroll_to_section',
        title: 'Scroll to homepage section',
        description: 'Scrolls to a section id on the page (e.g. tools, workflows, idp, security).',
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
            return JSON.stringify({ ok: false, error: 'Invalid id' })
          }
          const el = document.getElementById(id)
          if (!el) {
            return JSON.stringify({ ok: false, error: 'No element with that id' })
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return JSON.stringify({ ok: true, id })
        },
      },
    ]

    for (const tool of tools) {
      try {
        void mc.registerTool(tool, { signal })
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
