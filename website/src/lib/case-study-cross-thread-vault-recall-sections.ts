import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/case-studies/cross-thread-vault-recall` (h2 ids match @sindresorhus/slugify). */
export const caseStudyCrossThreadVaultRecallSections: Array<Section> = [
  {
    title: '1. Problem: conversation context is ephemeral',
    id: '1-problem-conversation-context-is-ephemeral',
  },
  {
    title: '2. Negative control: ask the repo alone',
    id: '2-negative-control-ask-the-repo-alone',
  },
  {
    title: '3. What a week of `memory_ingest` can look like (Obsidian graph)',
    id: '3-what-a-week-of-memory-ingest-can-look-like-obsidian-graph',
  },
  {
    title: '4. Positive control: `memory_recall()` surfaces vault-only plans',
    id: '4-positive-control-memory-recall-surfaces-vault-only-plans',
  },
  {
    title: '5. Follow-up: `search` + `execute` to create GitHub issues',
    id: '5-follow-up-search-execute-to-create-git-hub-issues',
  },
  {
    title: '6. Vault graph: ingest, wikilinks, and recall',
    id: '6-vault-graph-ingest-wikilinks-and-recall',
  },
  {
    title: '7. Session workflows: pause, summarize, resume',
    id: '7-session-workflows-pause-summarize-resume',
  },
  { title: '8. Token and relevance', id: '8-token-and-relevance' },
  { title: '9. Reproduction checklist', id: '9-reproduction-checklist' },
  { title: '10. References', id: '10-references' },
]
