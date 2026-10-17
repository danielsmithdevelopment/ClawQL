/**
 * Light GraphQL helpers + schema-builder entry.
 * `in-process-execute` (Omnigraph path) is not re-exported here so REST-prefer
 * gateway boots do not evaluate that module; import it from
 * `clawql-api/graphql/in-process-execute` or via execute-core's dynamic import.
 */
export * from "./execute-helpers.js";
export * from "./schema-builder.js";
