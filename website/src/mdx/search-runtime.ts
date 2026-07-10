import type { Document, SearchOptions } from 'flexsearch'
import FlexSearch from 'flexsearch'

import manifest from '@/generated/search-index/manifest.json'

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

const searchManifest = manifest as SearchManifest

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

async function loadSearchIndex(): Promise<Document> {
  const sectionIndex = createSectionIndex()

  await Promise.all(
    searchManifest.chunks.map(async (chunk) => {
      const pages = (await import(
        `@/generated/search-index/${chunk.file}`
      )) as { default: PageIndex[] }
      for (const page of pages.default) {
        addPageToIndex(sectionIndex, page)
      }
    }),
  )

  return sectionIndex
}

function getSearchIndex(): Promise<Document> {
  if (!indexPromise) {
    indexPromise = loadSearchIndex()
  }
  return indexPromise
}

export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<Array<Result>> {
  const sectionIndex = await getSearchIndex()
  const result = sectionIndex.search(query, {
    ...options,
    enrich: true,
  })

  if (!result.length) {
    return []
  }

  const first = result[0] as {
    result: Array<{ id: string; doc: { title: string; pageTitle?: string } }>
  }

  return first.result.map((item) => ({
    url: item.id,
    title: item.doc.title,
    pageTitle: item.doc.pageTitle,
  }))
}

/** Preload index during idle time (optional — search dialog may call this). */
export function preloadSearchIndex(): void {
  void getSearchIndex()
}
