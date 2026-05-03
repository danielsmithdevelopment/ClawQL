import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/audit-tool-and-observability` (h2 ids match @sindresorhus/slugify). */
export const learnAuditObservabilitySections: Array<Section> = [
  {
    title: 'What the audit tool is (and is not)',
    id: 'what-the-audit-tool-is-and-is-not',
  },
  {
    title: 'Operations: append, list, clear',
    id: 'operations-append-list-clear',
  },
  { title: 'Tune retention', id: 'tune-retention' },
  { title: 'Recall events in practice', id: 'recall-events-in-practice' },
  {
    title: 'Prometheus and Grafana (metrics)',
    id: 'prometheus-and-grafana-metrics',
  },
  {
    title: 'Loki: durable audit-shaped logs',
    id: 'loki-durable-audit-shaped-logs',
  },
  {
    title: 'End-to-end operator pattern',
    id: 'end-to-end-operator-pattern',
  },
  { title: 'Limits and compliance', id: 'limits-and-compliance' },
]
