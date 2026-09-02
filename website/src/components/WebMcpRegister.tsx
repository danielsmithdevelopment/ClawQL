'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import {
  fetchPageMarkdown,
  listDocsHubRoutes,
  listDocsSections,
  navigateSameOrigin,
  previewPluginFilter,
  resolvePluginEntry,
  runDocsSearch,
} from '@/lib/webmcp-docs-actions'
import { getModelContext } from '@/lib/webmcp-model-context'
import { preloadSearchIndex } from '@/mdx/search-runtime'

type ToolDef = {
  name: string
  title: string
  description: string
  inputSchema: object
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  execute: (input: object, client: ModelContextClient) => Promise<unknown>
}

/**
 * Registers WebMCP tools so browser agents can search, read, and navigate the docs site.
 * Feature-detects `document.modelContext ?? navigator.modelContext` (Chrome 149+).
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @see https://developer.chrome.com/docs/ai/webmcp/imperative-api
 */
export function WebMcpRegister() {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    const mc = getModelContext()
    if (!mc || typeof mc.registerTool !== 'function') return

    preloadSearchIndex()

    const ac = new AbortController()
    const { signal } = ac

    const tools: ToolDef[] = [
      {
        name: 'clawql.docs.search',
        title: 'Search ClawQL docs',
        description:
          'Full-text search across ClawQL documentation. Returns matching page URLs and section titles. Prefer this before guessing paths for navigate.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            query: {
              type: 'string',
              description:
                'Search query (e.g. "memory_recall", "celld", "helm")',
              minLength: 1,
              maxLength: 200,
            },
            limit: {
              type: 'integer',
              description: 'Max results (default 8, max 20)',
              minimum: 1,
              maximum: 20,
            },
          },
          required: ['query'],
        },
        annotations: { readOnlyHint: true },
        async execute(input) {
          const raw = input as { query?: string; limit?: number }
          return runDocsSearch({
            query: String(raw.query ?? ''),
            limit: raw.limit,
          })
        },
      },
      {
        name: 'clawql.docs.list_routes',
        title: 'List docs hub routes',
        description:
          'Returns a curated map of high-value documentation hubs (getting started, learn, plugins, security, streams, …). Use with clawql.docs.navigate or search for deeper pages.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        annotations: { readOnlyHint: true },
        async execute() {
          return listDocsHubRoutes()
        },
      },
      {
        name: 'clawql.docs.list_sections',
        title: 'List page sections',
        description:
          'Lists heading ids and titles for the current page (or an optional path’s known TOC). Use ids with clawql.docs.scroll_to_section.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
              description:
                'Optional docs path (default: current page). Same-origin path starting with /.',
            },
          },
        },
        annotations: { readOnlyHint: true },
        async execute(input) {
          const raw = input as { path?: string }
          const path =
            typeof raw.path === 'string' && raw.path.trim()
              ? raw.path
              : pathnameRef.current
          return listDocsSections(path)
        },
      },
      {
        name: 'clawql.docs.get_page_markdown',
        title: 'Get page markdown',
        description:
          'Fetches the agent-oriented Markdown body for the current page or an optional path (Accept: text/markdown). Truncated if very long — use search + a specific path for long docs.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
              description:
                'Optional docs path (default: current page). Same-origin path starting with /.',
            },
          },
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        async execute(input, client) {
          const raw = input as { path?: string }
          const path =
            typeof raw.path === 'string' && raw.path.trim()
              ? raw.path
              : pathnameRef.current
          return fetchPageMarkdown(path, client?.signal)
        },
      },
      {
        name: 'clawql.docs.navigate',
        title: 'Navigate ClawQL docs',
        description:
          'Navigate to a page on this documentation site. Prefer clawql.docs.search or clawql.docs.list_routes to discover paths. Only same-origin relative paths are allowed (e.g. /learn/memory, /plugins#registry).',
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
        async execute(input) {
          const raw = input as { path?: string }
          return navigateSameOrigin(router, String(raw.path ?? ''))
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
        async execute() {
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
          'Scrolls the main view to a heading or section with the given HTML id. Discover ids with clawql.docs.list_sections.',
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
        async execute(input) {
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
        void mc.registerTool(tool, { signal })
      } catch (err) {
        console.warn('[WebMCP] registerTool failed:', tool.name, err)
      }
    }

    return () => {
      ac.abort()
    }
  }, [router])

  // Plugins registry tools — only while browsing /plugins*
  useEffect(() => {
    if (!pathname.startsWith('/plugins')) return
    const mc = getModelContext()
    if (!mc || typeof mc.registerTool !== 'function') return

    const ac = new AbortController()
    const { signal } = ac

    const tools: ToolDef[] = [
      {
        name: 'clawql.docs.filter_plugin_registry',
        title: 'Filter plugin registry',
        description:
          'Filters the interactive /plugins registry by free-text query, kind (horizontal|vertical|proxy|core|providers|third-party), and status (available|planned|roadmap). Updates the visible table via URL and returns a match preview.',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            query: {
              type: 'string',
              description:
                'Optional text filter (name, package, tools, keywords)',
            },
            kind: {
              type: 'string',
              description:
                'Category filter: all | horizontal | vertical | proxy | core | providers | third-party',
            },
            status: {
              type: 'string',
              description: 'Status filter: all | available | planned | roadmap',
            },
          },
        },
        annotations: { readOnlyHint: false },
        async execute(input) {
          const raw = input as {
            query?: string
            kind?: string
            status?: string
          }
          const preview = previewPluginFilter(raw)
          router.push(preview.path)
          return { ok: true, ...preview }
        },
      },
      {
        name: 'clawql.docs.open_plugin',
        title: 'Open plugin docs',
        description:
          'Opens a plugin’s documentation page by id, name, package, or slug (e.g. memory, clawql-memory, lending).',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            plugin: {
              type: 'string',
              description: 'Plugin id, display name, package, or URL slug',
            },
          },
          required: ['plugin'],
        },
        annotations: { readOnlyHint: false },
        async execute(input) {
          const raw = input as { plugin?: string }
          const entry = resolvePluginEntry(String(raw.plugin ?? ''))
          if (!entry) {
            return {
              ok: false,
              error: 'No plugin matched that id/name/package/slug',
            }
          }
          router.push(entry.href)
          return {
            ok: true,
            id: entry.id,
            name: entry.name,
            href: entry.href,
            category: entry.category,
            status: entry.status,
          }
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
  }, [pathname, router])

  return null
}
