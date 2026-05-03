import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/vault-memory-between-chats` (h2 ids match @sindresorhus/slugify). */
export const learnVaultMemoryHandoffSections: Array<Section> = [
  {
    title: 'Why this persists (and how it differs from cache)',
    id: 'why-this-persists-and-how-it-differs-from-cache',
  },
  {
    title: 'Storage you must provide (local dir or PVC)',
    id: 'storage-you-must-provide-local-dir-or-pvc',
  },
  { title: 'Before you start', id: 'before-you-start' },
  {
    title: 'Pattern: checkpoint with memory_ingest',
    id: 'pattern-checkpoint-with-memory-ingest',
  },
  {
    title: 'Pattern: hydrate with memory_recall',
    id: 'pattern-hydrate-with-memory-recall',
  },
  {
    title: 'Stable titles, wikilinks, and append',
    id: 'stable-titles-wikilinks-and-append',
  },
  { title: 'Limits and pitfalls', id: 'limits-and-pitfalls' },
  { title: 'When cache is still enough', id: 'when-cache-is-still-enough' },
]
