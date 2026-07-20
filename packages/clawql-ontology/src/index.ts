export type {
  GeneratedReadTool,
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
} from "./fixture-store.js";
export { redactOntologyPiiFields } from "./pii.js";
