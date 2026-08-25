/** Layer 3 — meta-ontologically learned ontologies. */
export {
  MetaOntologyStoreService,
  MetaOntologyStoreLive,
  makeMetaOntologyStoreLive,
  metaStoreLayerForPath,
  runWithMetaStore,
  reliabilityScore,
  type LearnedEntityRow,
} from "./meta/store.js";
export { ingestOBTTrace, extractOntologyEvidence } from "./meta/trace-ingester.js";
export {
  scaffoldWithMeta,
  mergeWithSchema,
  getBestQueryStrategy,
} from "./meta/meta-scaffold.js";
export {
  checkPromotionCandidates,
  promoteDocumentType,
  type PromoteResult,
} from "./meta/promote.js";
export type {
  FieldObservation,
  QueryObservation,
  EntityObservation,
  OntologyEvidence,
  OBTRecord,
  OBTTurn,
  OBTVerdict,
} from "./meta/types.js";
