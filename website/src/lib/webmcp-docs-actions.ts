import { DOC_LAYOUT_SECTIONS_BY_PATH } from '@/lib/doc-layout-sections'
import {
  pluginRegistryEntries,
  type PluginCategory,
  type PluginRegistryEntry,
} from '@/lib/plugin-registry-data'
import {
  filterEntries,
  type CategoryFilter,
  type StatusFilter,
} from '@/lib/plugin-registry-query'
import { DOCS_HUB_ROUTES } from '@/lib/webmcp-docs-hub-routes'
import { search as searchDocsIndex } from '@/mdx/search-runtime'

const MARKDOWN_MAX_CHARS = 48_000
const SEARCH_DEFAULT_LIMIT = 8
const SEARCH_MAX_LIMIT = 20
const SEARCH_QUERY_MAX = 200

export function isSameOriginPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

export function normalizeDocsPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return '/'
  const noHash = trimmed.split('#')[0] ?? trimmed
  const noQuery = noHash.split('?')[0] ?? noHash
  if (noQuery.length > 1 && noQuery.endsWith('/')) {
    return noQuery.slice(0, -1)
  }
  return noQuery || '/'
}

export async function runDocsSearch(input: {
  query: string
  limit?: number
}): Promise<{
  ok: true
  query: string
  count: number
  results: Array<{ url: string; title: string; pageTitle?: string }>
}> {
  const query = String(input.query ?? '')
    .trim()
    .slice(0, SEARCH_QUERY_MAX)
  const limit = Math.min(
    Math.max(Number(input.limit) || SEARCH_DEFAULT_LIMIT, 1),
    SEARCH_MAX_LIMIT,
  )
  if (!query) {
    return { ok: true, query, count: 0, results: [] }
  }
  const hits = await searchDocsIndex(query, { limit })
  const results = hits.slice(0, limit)
  return { ok: true, query, count: results.length, results }
}

export function listDocsSections(pathname: string): {
  ok: true
  path: string
  sections: Array<{ id: string; title: string; source: 'toc' | 'dom' }>
} {
  const path = normalizeDocsPath(pathname)
  const fromToc = (DOC_LAYOUT_SECTIONS_BY_PATH[path] ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    source: 'toc' as const,
  }))
  const seen = new Set(fromToc.map((s) => s.id))
  const fromDom: Array<{ id: string; title: string; source: 'dom' }> = []
  // Only scrape the live DOM when asking about the page currently rendered.
  const current =
    typeof window !== 'undefined'
      ? normalizeDocsPath(window.location.pathname)
      : null
  if (typeof document !== 'undefined' && current === path) {
    const root =
      document.getElementById('main-content') ?? document.body ?? null
    if (root) {
      for (const el of root.querySelectorAll('h2[id], h3[id]')) {
        const id = el.id
        if (!id || seen.has(id)) continue
        seen.add(id)
        fromDom.push({
          id,
          title: (el.textContent ?? id).trim().replace(/\s+/g, ' '),
          source: 'dom',
        })
      }
    }
  }
  return { ok: true, path, sections: [...fromToc, ...fromDom] }
}

export function listDocsHubRoutes(): {
  ok: true
  count: number
  routes: typeof DOCS_HUB_ROUTES
} {
  return { ok: true, count: DOCS_HUB_ROUTES.length, routes: DOCS_HUB_ROUTES }
}

export async function fetchPageMarkdown(
  path: string,
  signal?: AbortSignal,
): Promise<{
  ok: boolean
  path: string
  truncated?: boolean
  chars?: number
  markdown?: string
  error?: string
  status?: number
}> {
  const target = normalizeDocsPath(path)
  if (!isSameOriginPath(target)) {
    return { ok: false, path: target, error: 'Path must be same-origin' }
  }
  try {
    const res = await fetch(target, {
      headers: { Accept: 'text/markdown' },
      signal,
    })
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok) {
      return {
        ok: false,
        path: target,
        status: res.status,
        error: `Markdown fetch failed (${res.status})`,
      }
    }
    if (
      !contentType.includes('markdown') &&
      !contentType.includes('text/plain')
    ) {
      const peek = (await res.clone().text()).slice(0, 40)
      if (peek.trimStart().startsWith('<')) {
        return {
          ok: false,
          path: target,
          error:
            'Response was HTML, not markdown (Accept: text/markdown negotiation failed)',
        }
      }
    }
    let markdown = await res.text()
    const truncated = markdown.length > MARKDOWN_MAX_CHARS
    if (truncated) {
      markdown =
        markdown.slice(0, MARKDOWN_MAX_CHARS) +
        '\n\n…[truncated for WebMCP; fetch a specific path or use search]'
    }
    return {
      ok: true,
      path: target,
      truncated,
      chars: markdown.length,
      markdown,
    }
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, path: target, error: 'Aborted' }
    }
    return {
      ok: false,
      path: target,
      error: err instanceof Error ? err.message : 'Fetch failed',
    }
  }
}

const CATEGORY_VALUES = new Set<string>([
  'all',
  'horizontal',
  'vertical',
  'proxy',
  'core',
  'providers',
  'third-party',
])

const STATUS_VALUES = new Set<string>([
  'all',
  'available',
  'planned',
  'roadmap',
])

export function buildPluginsRegistryPath(input: {
  query?: string
  kind?: string
  status?: string
}): string {
  const params = new URLSearchParams()
  const q = String(input.query ?? '').trim()
  const kind = String(input.kind ?? 'all').trim()
  const status = String(input.status ?? 'all').trim()
  if (q) params.set('q', q.slice(0, 120))
  if (kind && kind !== 'all' && CATEGORY_VALUES.has(kind)) {
    params.set('kind', kind)
  }
  if (status && status !== 'all' && STATUS_VALUES.has(status)) {
    params.set('status', status)
  }
  const qs = params.toString()
  return `/plugins${qs ? `?${qs}` : ''}#registry`
}

export function previewPluginFilter(input: {
  query?: string
  kind?: string
  status?: string
}): {
  path: string
  matchCount: number
  sample: Array<{
    id: string
    name: string
    category: PluginCategory
    status: string
    href: string
  }>
} {
  const path = buildPluginsRegistryPath(input)
  const category = (
    CATEGORY_VALUES.has(String(input.kind ?? 'all'))
      ? String(input.kind ?? 'all')
      : 'all'
  ) as CategoryFilter
  const status = (
    STATUS_VALUES.has(String(input.status ?? 'all'))
      ? String(input.status ?? 'all')
      : 'all'
  ) as StatusFilter
  const filtered = filterEntries(pluginRegistryEntries, {
    query: String(input.query ?? ''),
    category,
    status,
  })
  return {
    path,
    matchCount: filtered.length,
    sample: filtered.slice(0, 8).map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      status: e.status,
      href: e.href,
    })),
  }
}

export function resolvePluginEntry(
  raw: string,
): PluginRegistryEntry | undefined {
  const key = raw.trim().toLowerCase()
  if (!key) return undefined
  return pluginRegistryEntries.find((e) => {
    if (e.id.toLowerCase() === key) return true
    if (e.name.toLowerCase() === key) return true
    if (e.package?.toLowerCase() === key) return true
    const hrefSlug = e.href.split('?')[0]?.split('/').pop()?.toLowerCase()
    return hrefSlug === key
  })
}

export function navigateSameOrigin(
  router: { push: (href: string) => void },
  path: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (!isSameOriginPath(path)) {
    return {
      ok: false,
      error: 'Path must be a same-origin path starting with /',
    }
  }
  router.push(path)
  return { ok: true, path }
}
