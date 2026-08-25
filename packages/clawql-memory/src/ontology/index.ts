/**
 * Ontology index + structured recall exports for clawql-memory.
 */
export {
  runOntologyRecall,
  wantsStructuredOntologyRecall,
  buildMatterWhereClause,
  ensureOntologyMattersIndexed,
  isLegalOntologySchema,
  isDynamicOntologySchema,
  LEGAL_ONTOLOGY_SCHEMAS,
  type OntologySchema,
  type OntologyFilter,
  type OntologyRecallInput,
  type OntologyRecallResult,
  type OntologyRecallFailure,
  type OntologyRecallHit,
  type LegalOntologySchema,
} from "./ontology-query.js";
export {
  openOntologyDb,
  ontologyDbEnabled,
  ontologyDbExplicitlyDisabled,
  resolveOntologyDatabasePath,
  withOntologyWriteLock,
} from "./ontology-db.js";
export type {
  DynamicEntityDef,
  DynamicFieldDef,
  DynamicRelationshipDef,
  DynamicRecordRow,
} from "./ontology-dynamic.js";
export {
  registerDynamicOntologyEntity,
  upsertDynamicOntologyRecord,
  syncDynamicOntologyDocument,
} from "./ontology-register.js";
export { matchDynamicFilters, matchDynamicPredicate } from "./dynamic-filter.js";
