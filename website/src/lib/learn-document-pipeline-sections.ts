import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/document-pipeline` (h2 ids match @sindresorhus/slugify). */
export const learnDocumentPipelineSections: Array<Section> = [
  {
    title: 'What the seven-vendor document stack is',
    id: 'what-the-seven-vendor-document-stack-is',
  },
  {
    title: 'Recommended IDP data flow',
    id: 'recommended-idp-data-flow',
  },
  {
    title: 'Nextcloud collaboration storage',
    id: 'nextcloud-collaboration-storage',
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
    title: 'Coneshare secure sharing and VDR',
    id: 'coneshare-secure-sharing-and-vdr',
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
