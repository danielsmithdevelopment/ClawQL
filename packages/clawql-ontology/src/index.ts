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
} from "./generate.js";
