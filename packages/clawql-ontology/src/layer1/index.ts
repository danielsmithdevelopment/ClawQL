/** Layer 1 — pre-built domain ontologies (existing pack / lint / generate surface). */
export {
  defaultOntologySearchRoots,
  discoverOntologyEntityFiles,
  loadOntologyEntities,
  loadOntologyEntityFile,
} from "../load.js";
export { defaultEntitySchemaPath, lintOntology } from "../lint.js";
export {
  generateOntologyReadTools,
  isShipableLowNativeWrite,
  isShipableNativeWrite,
} from "../generate.js";
export {
  createOntologyEntity,
  importOntologyPack,
  initOntologyTree,
  listOntologyPacks,
  ontologyRoot,
} from "../scaffold.js";
