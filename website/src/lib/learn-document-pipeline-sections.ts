import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/document-pipeline` (h2 ids match @sindresorhus/slugify). */
export const learnDocumentPipelineSections: Array<Section> = [
  {
    title: 'What the five-vendor document stack is',
    id: 'what-the-five-vendor-document-stack-is',
  },
  {
    title: 'Recommended data flow from Tika to Onyx',
    id: 'recommended-data-flow-from-tika-to-onyx',
  },
  {
    title: 'Tika text and metadata extraction',
    id: 'tika-text-and-metadata-extraction',
  },
  { title: 'Gotenberg normalize to PDF', id: 'gotenberg-normalize-to-pdf' },
  { title: 'Stirling PDF remediation', id: 'stirling-pdf-remediation' },
  { title: 'Paperless archive and search', id: 'paperless-archive-and-search' },
  {
    title: 'Onyx enterprise retrieval and ingestion',
    id: 'onyx-enterprise-retrieval-and-ingestion',
  },
  {
    title: 'Orchestrating with search and execute',
    id: 'orchestrating-with-search-and-execute',
  },
  {
    title: 'Documents feature flag and environment',
    id: 'documents-feature-flag-and-environment',
  },
  {
    title: 'Related posts guides and references',
    id: 'related-posts-guides-and-references',
  },
]
