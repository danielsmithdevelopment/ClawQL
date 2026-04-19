import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/case-studies/cross-thread-vault-recall`. */
export const caseStudyCrossThreadVaultRecallSections: Array<Section> = [
  {
    title: 'Problem: conversation context is ephemeral',
    id: 'problem-conversation-context-is-ephemeral',
  },
  {
    title: 'Negative control: repo-only search',
    id: 'negative-control-repo-only-search',
  },
  {
    title: 'Obsidian graph after a week of ingest',
    id: 'obsidian-graph-after-a-week-of-ingest',
  },
  {
    title: 'Positive control: memory_recall',
    id: 'positive-control-memory-recall',
  },
  {
    title: 'Follow-up: search and execute to create tracking issues',
    id: 'follow-up-search-and-execute-to-create-tracking-issues',
  },
  {
    title: 'Vault graph: ingest, wikilinks, and recall',
    id: 'vault-graph-ingest-wikilinks-and-recall',
  },
  {
    title: 'Session workflows: pause, summarize, resume',
    id: 'session-workflows-pause-summarize-resume',
  },
  { title: 'Token budget and relevance', id: 'token-budget-and-relevance' },
  { title: 'Reproduction checklist', id: 'reproduction-checklist' },
  { title: 'References', id: 'references' },
]
