export type {
  GeneratedReadTool,
  GeneratedWriteTool,
  LoadedOntologyEntity,
  OntologyAction,
  OntologyEntityDocument,
  OntologyGenerateResult,
  OntologyIssue,
  OntologyLintResult,
  OntologyProperty,
  OntologyRelationship,
  OntologySource,
} from "./types.js";
export {
  defaultOntologySearchRoots,
  discoverOntologyEntityFiles,
  loadOntologyEntities,
  loadOntologyEntityFile,
} from "./load.js";
export { defaultEntitySchemaPath, lintOntology, type LintOntologyOptions } from "./lint.js";
export {
  generateOntologyReadTools,
  isShipableLowNativeWrite,
  isShipableNativeWrite,
  type GenerateOntologyOptions,
  _relationshipToolNameForTests,
} from "./generate.js";
export {
  createOntologyEntity,
  importOntologyPack,
  initOntologyTree,
  listOntologyPacks,
  ontologyRoot,
} from "./scaffold.js";
export {
  getContract,
  loadOntologyFixtureDb,
  resetOntologyFixtureDbForTests,
  searchContracts,
  updateContractStatus,
  updateContractValue,
} from "./fixture-store.js";
export { redactOntologyPiiFields } from "./pii.js";
export {
  checkKineticMandate,
  checkKineticWriteAllowed,
  listKineticAudit,
  resetKineticAuditForTests,
  resolveKineticAtrClaimsForRuntime,
  runKineticTransaction,
  runLowKineticTransaction,
  type KineticAtrClaims,
  type KineticMandate,
  type LowKineticWriteResult,
} from "./kinetic/index.js";

/* ——— Three-layer meta-ontology (v0.1) ——— */
export type {
  CQEEntity,
  CQEField,
  CQEFieldType,
  CQERelationship,
  CQEEntitySource,
  ScaffoldOptions,
  ScaffoldResult,
  ScaffoldTtl,
  JSONSchema,
  DoclingOutput,
  DoclingFormField,
  DoclingTable,
  PopulateResult,
  QueryGoal,
  QueryPattern,
  FieldReliability,
  FailurePattern,
  PromotionCandidate,
} from "./shared/cqe-runtime-types.js";
export {
  OntologyIndexService,
  OntologyIndexLive,
  makeOntologyIndexLive,
  runWithOntologyIndex,
  type DynamicRecord,
  type IndexedEntity,
} from "./shared/ontology-index.js";
export { cqeEntityToYaml, cqeEntityToYamlSync } from "./shared/cqe-to-yaml.js";
export { OntologyError, ontologyFromPromise, ontologySync } from "./effect/ontology-errors.js";
export {
  readOntologyMetaConfig,
  readOntologyMetaConfigSync,
  type OntologyMetaConfig,
} from "./effect/ontology-meta-config.js";
export {
  scaffoldFromJsonSchema,
  jsonTypeToCQEType,
  scaffoldFromDocling,
  inferTypeFromValue,
  populateFromDocling,
  normalizeValue,
} from "./layer2/index.js";
export {
  MetaOntologyStoreService,
  MetaOntologyStoreLive,
  makeMetaOntologyStoreLive,
  metaStoreLayerForPath,
  runWithMetaStore,
  ingestOBTTrace,
  extractOntologyEvidence,
  scaffoldWithMeta,
  mergeWithSchema,
  getBestQueryStrategy,
  checkPromotionCandidates,
  promoteDocumentType,
  type LearnedEntityRow,
  type PromoteResult,
  type OBTRecord,
  type OntologyEvidence,
} from "./layer3/index.js";
