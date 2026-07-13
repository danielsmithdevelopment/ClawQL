import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/memory` (h2 ids match @sindresorhus/slugify). */
export const learnMemorySections: Array<Section> = [
  {
    title: 'What problem memory solves',
    id: 'what-problem-memory-solves',
  },
  {
    title: 'Core design principles',
    id: 'core-design-principles',
  },
  {
    title: 'Architecture: vault, graph index, PageIndex, vectors',
    id: 'architecture-vault-graph-index-page-index-vectors',
  },
  {
    title: 'MCP tools and enablement',
    id: 'mcp-tools-and-enablement',
  },
  {
    title: 'Hands-on: memory between chats',
    id: 'hands-on-memory-between-chats',
  },
  {
    title: 'Ingestion: from agent summary to vault page',
    id: 'ingestion-from-agent-summary-to-vault-page',
  },
  {
    title: 'Wiki-style linking and the knowledge graph',
    id: 'wiki-style-linking-and-the-knowledge-graph',
  },
  {
    title: 'Hybrid recall: keywords, wikilinks, and vectors',
    id: 'hybrid-recall-keywords-wikilinks-and-vectors',
  },
  {
    title: 'Team sync: shared vaults across agents and teammates',
    id: 'team-sync-shared-vaults-across-agents-and-teammates',
  },
  {
    title: 'Self-improving loop: memory meets inference',
    id: 'self-improving-loop-memory-meets-inference',
  },
  {
    title: 'Semantic pruning and pre-pruning snapshots (roadmap)',
    id: 'semantic-pruning-and-pre-pruning-snapshots-roadmap',
  },
  {
    title: 'Governance, security, and observability',
    id: 'governance-security-and-observability',
  },
  {
    title: 'Related guides and references',
    id: 'related-guides-and-references',
  },
]
