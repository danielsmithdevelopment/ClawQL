import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/search-and-execute-mcp` (h2 ids match @sindresorhus/slugify). */
export const learnSearchExecuteSections: Array<Section> = [
  { title: 'Why search then execute', id: 'why-search-then-execute' },
  { title: 'Before you start', id: 'before-you-start' },
  { title: 'The search tool', id: 'the-search-tool' },
  { title: 'The execute tool', id: 'the-execute-tool' },
  {
    title: 'Authentication and parameters',
    id: 'authentication-and-parameters',
  },
  { title: 'Trim responses with fields', id: 'trim-responses-with-fields' },
  {
    title: 'REST index plus optional native APIs',
    id: 'rest-index-plus-optional-native-apis',
  },
  { title: 'Case studies for background', id: 'case-studies-for-background' },
  { title: 'Limits and common errors', id: 'limits-and-common-errors' },
]
