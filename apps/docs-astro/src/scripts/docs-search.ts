import FlexSearch from 'flexsearch'

export type SearchResult = {
  url: string
  title: string
  pageTitle?: string
}

type SectionTuple = [title: string, hash: string | null, content: string[]]
type PageIndex = { url: string; sections: SectionTuple[] }
type SearchManifest = {
  version: number
  chunks: Array<{ id: string; file: string; pages: number }>
}

// FlexSearch Document instance (package typings are loose across versions).
type SectionIndex = {
  add: (doc: Record<string, string>) => void
  search: (
    query: string,
    options: { limit?: number; enrich?: boolean },
  ) => unknown
}

function createSectionIndex(): SectionIndex {
  return new FlexSearch.Document({
    tokenize: 'full',
    document: {
      id: 'url',
      index: 'content',
      store: ['title', 'pageTitle'],
    },
    context: {
      resolution: 9,
      depth: 2,
      bidirectional: true,
    },
  }) as SectionIndex
}

function addPageToIndex(sectionIndex: SectionIndex, page: PageIndex) {
  for (const [title, hash, content] of page.sections) {
    const entry: Record<string, string> = {
      url: page.url + (hash ? `#${hash}` : ''),
      title,
      content: [title, ...content].join('\n'),
    }
    if (hash && page.sections[0]?.[0]) {
      entry.pageTitle = page.sections[0][0]
    }
    sectionIndex.add(entry)
  }
}

let indexPromise: Promise<SectionIndex> | null = null

async function loadSearchIndex(): Promise<SectionIndex> {
  const sectionIndex = createSectionIndex()
  const manifestRes = await fetch('/search-index/manifest.json')
  if (!manifestRes.ok) {
    throw new Error(`Failed to load search manifest (${manifestRes.status})`)
  }
  const manifest = (await manifestRes.json()) as SearchManifest
  await Promise.all(
    manifest.chunks.map(async (chunk) => {
      const res = await fetch(`/search-index/${encodeURIComponent(chunk.file)}`)
      if (!res.ok) {
        throw new Error(`Failed to load search chunk ${chunk.file} (${res.status})`)
      }
      const pages = (await res.json()) as PageIndex[]
      for (const page of pages) addPageToIndex(sectionIndex, page)
    }),
  )
  return sectionIndex
}

function getSearchIndex() {
  if (!indexPromise) {
    indexPromise = loadSearchIndex().catch((err) => {
      indexPromise = null
      throw err
    })
  }
  return indexPromise
}

export async function searchDocs(
  query: string,
  limit = 8,
): Promise<SearchResult[]> {
  try {
    const sectionIndex = await getSearchIndex()
    const result = sectionIndex.search(query, { limit, enrich: true }) as Array<{
      result: Array<{
        id: string
        doc: { title: string; pageTitle?: string } | null
      }>
    }>
    if (!Array.isArray(result) || !result.length) return []
    return (result[0].result ?? [])
      .filter(
        (
          item,
        ): item is {
          id: string
          doc: { title: string; pageTitle?: string }
        } => Boolean(item?.doc),
      )
      .map((item) => ({
        url: item.id,
        title: item.doc.title,
        pageTitle: item.doc.pageTitle,
      }))
  } catch {
    return []
  }
}

export function preloadSearchIndex() {
  void getSearchIndex()
}

function highlight(text: string, query: string): string {
  const q = query.trim()
  if (!q) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const re = new RegExp(`(${escapeRegExp(q)})`, 'ig')
  return escaped.replace(
    re,
    '<mark class="bg-transparent text-[#0e7490] underline dark:text-claw-cyan">$1</mark>',
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function initDocsSearch() {
  const dialog = document.getElementById('docs-search-dialog')
  const input = document.getElementById('docs-search-input') as HTMLInputElement | null
  const resultsEl = document.getElementById('docs-search-results')
  const openers = document.querySelectorAll('[data-docs-search-open]')
  if (!dialog || !input || !resultsEl) return

  let active = 0
  let items: SearchResult[] = []
  let query = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  function open() {
    dialog!.classList.remove('hidden')
    document.body.classList.add('overflow-hidden')
    input!.value = ''
    query = ''
    items = []
    active = 0
    resultsEl!.innerHTML =
      '<p class="px-4 py-6 text-center text-sm text-zinc-500">Type to search documentation…</p>'
    requestAnimationFrame(() => input!.focus())
    preloadSearchIndex()
  }

  function close() {
    dialog!.classList.add('hidden')
    document.body.classList.remove('overflow-hidden')
  }

  function render() {
    if (!query) {
      resultsEl!.innerHTML =
        '<p class="px-4 py-6 text-center text-sm text-zinc-500">Type to search documentation…</p>'
      return
    }
    if (items.length === 0) {
      resultsEl!.innerHTML = `<div class="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">Nothing found for <strong class="text-zinc-900 dark:text-white">‘${escapeHtml(query)}’</strong>.</div>`
      return
    }
    resultsEl!.innerHTML = `<ul role="listbox" id="docs-search-listbox" class="max-h-[min(24rem,calc(100dvh-8rem))] overflow-y-auto">${items
      .map((item, i) => {
        const selected = i === active
        const crumb = [item.pageTitle].filter(Boolean).join(' / ')
        return `<li role="option" aria-selected="${selected}" data-index="${i}" class="cursor-pointer border-t border-zinc-100 px-4 py-3 first:border-t-0 dark:border-zinc-800 ${selected ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}">
          <div class="text-sm font-medium text-zinc-900 dark:text-white">${highlight(item.title, query)}</div>
          ${crumb ? `<div class="mt-1 truncate text-xs text-zinc-500">${highlight(crumb, query)}</div>` : ''}
        </li>`
      })
      .join('')}</ul>`

    resultsEl!.querySelectorAll('[data-index]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        active = Number((el as HTMLElement).dataset.index)
        render()
      })
      el.addEventListener('click', () => navigate(items[Number((el as HTMLElement).dataset.index)]))
    })
  }

  function navigate(item: SearchResult | undefined) {
    if (!item) return
    close()
    window.location.assign(item.url)
  }

  async function runSearch(q: string) {
    query = q
    if (!q.trim()) {
      items = []
      render()
      return
    }
    resultsEl!.innerHTML =
      '<p class="px-4 py-6 text-center text-sm text-zinc-500">Searching…</p>'
    items = await searchDocs(q, 8)
    active = 0
    render()
  }

  openers.forEach((el) => el.addEventListener('click', open))
  dialog.querySelectorAll('[data-docs-search-close]').forEach((el) => {
    el.addEventListener('click', close)
  })

  input.addEventListener('input', () => {
    const q = input.value
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void runSearch(q), 120)
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!input.value) close()
      else {
        input.value = ''
        void runSearch('')
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!items.length) return
      active = (active + 1) % items.length
      render()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!items.length) return
      active = (active - 1 + items.length) % items.length
      render()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      navigate(items[active])
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (dialog.classList.contains('hidden')) open()
      else close()
    }
  })

  // Idle preload so first ⌘K is snappy
  if ('requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
      () => preloadSearchIndex(),
    )
  } else {
    setTimeout(() => preloadSearchIndex(), 1500)
  }
}
