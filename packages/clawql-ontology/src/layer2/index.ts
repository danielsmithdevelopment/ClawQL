/** Layer 2 — runtime-scaffolded ontologies. */
export { scaffoldFromJsonSchema, jsonTypeToCQEType } from "./scaffold/json-schema.js";
export {
  scaffoldFromDocling,
  inferTypeFromValue,
  inferTypeFromColumn,
} from "./scaffold/document-structure.js";
export { populateFromDocling, normalizeValue } from "./scaffold/populate.js";
export { populateFromRecord } from "./scaffold/populate-record.js";
