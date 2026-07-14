import type { Document, SearchOptions } from 'flexsearch'
import FlexSearch from 'flexsearch'

export type Result = {
  url: string
  title: string
  pageTitle?: string
}

type SectionTuple = [title: string, hash: string | null, content: string[]]

type PageIndex = {
  url: string
  sections: SectionTuple[]
}

type SearchManifest = {
  version: number
  chunks: Array<{ id: string; file: string; pages: number }>
}

function createSectionIndex(): Document {
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
  })
}

function addPageToIndex(
  sectionIndex: Document,
  { url, sections }: PageIndex,
): void {
  for (const [title, hash, content] of sections) {
    const entry: Record<string, string> = {
      url: url + (hash ? `#${hash}` : ''),
      title,
      content: [title, ...content].join('\n'),
    }
    if (hash && sections[0]?.[0]) {
      entry.pageTitle = sections[0][0]
    }
    sectionIndex.add(entry)
  }
}

let indexPromise: Promise<Document> | null = null
let manifestPromise: Promise<SearchManifest> | null = null

async function loadManifest(): Promise<SearchManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/search-index/manifest.json').then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load search manifest (${res.status})`)
      }
      return res.json() as Promise<SearchManifest>
    })
  }
  return manifestPromise
}

async function loadSearchIndex(): Promise<Document> {
  const sectionIndex = createSectionIndex()
  const manifest = await loadManifest()

  await Promise.all(
    manifest.chunks.map(async (chunk) => {
      const res = await fetch(`/search-index/${chunk.file}`)
      if (!res.ok) {
        throw new Error(
          `Failed to load search chunk ${chunk.file} (${res.status})`,
        )
      }
      const pages = (await res.json()) as PageIndex[]
      for (const page of pages) {
        addPageToIndex(sectionIndex, page)
      }
    }),
  )

  return sectionIndex
}

function getSearchIndex(): Promise<Document> {
  if (!indexPromise) {
    indexPromise = loadSearchIndex().catch((error) => {
      indexPromise = null
      throw error
    })
  }
  return indexPromise
}

export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<Array<Result>> {
  try {
    const sectionIndex = await getSearchIndex()
    const result = sectionIndex.search(query, {
      ...options,
      enrich: true,
    })

    if (!result.length) {
      return []
    }

    const first = result[0] as {
      result: Array<{
        id: string
        doc: { title: string; pageTitle?: string } | null
      }>
    }

    return (first.result ?? [])
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

/** Preload index during idle time (optional — search dialog may call this). */
export function preloadSearchIndex(): void {
  void getSearchIndex()
}
