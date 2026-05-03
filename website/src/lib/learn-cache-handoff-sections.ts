import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/cache-handoff-between-chats` (h2 ids match @sindresorhus/slugify). */
export const learnCacheHandoffSections: Array<Section> = [
  {
    title: 'Why this works (and when it does not)',
    id: 'why-this-works-and-when-it-does-not',
  },
  { title: 'Before you start', id: 'before-you-start' },
  {
    title: 'Pattern: checkpoint at the end of a chat',
    id: 'pattern-checkpoint-at-the-end-of-a-chat',
  },
  { title: 'Pattern: hydrate a new chat', id: 'pattern-hydrate-a-new-chat' },
  { title: 'Key naming and discovery', id: 'key-naming-and-discovery' },
  { title: 'Limits and pitfalls', id: 'limits-and-pitfalls' },
  {
    title: 'When to use vault memory instead',
    id: 'when-to-use-vault-memory-instead',
  },
]
