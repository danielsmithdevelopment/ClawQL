/**
 * Shared ontology entity types (v1alpha1).
 */

export type OntologyProperty = {
  type?: string;
  required?: boolean;
  indexed?: boolean;
  mutable?: boolean;
  kinetic_level?: string;
  requires_mandate?: string;
  change_limit?: string;
  values?: string[];
  items?: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
};

export type OntologySource = {
  type?: string;
  connection?: string;
  table?: string;
  id_column?: string;
  path?: string;
  classifier?: string;
  operationId?: string;
  [key: string]: unknown;
};

export type OntologyRelationship = {
  entity: string;
  type: string;
  via?: string;
  description?: string;
};

export type OntologyAction = {
  name: string;
  kind: "read" | "write";
  description?: string;
  kinetic?: boolean;
  kinetic_level?: string;
  requires_mandate?: boolean;
  mandate_type?: string;
  blast_radius?: string;
  rollback_protocol?: string;
  executor?: string;
  workflow?: string;
  requires_human_in_loop?: boolean;
  audit_level?: string;
  [key: string]: unknown;
};

export type OntologyEntityDocument = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec: {
    description: string;
    properties: Record<string, OntologyProperty>;
    pii_fields?: string[];
    sources?: OntologySource[];
    relationships?: OntologyRelationship[];
    actions?: OntologyAction[];
  };
};

export type LoadedOntologyEntity = {
  path: string;
  entity: OntologyEntityDocument;
};

export type OntologyIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
  pointer?: string;
};

export type OntologyLintResult = {
  ok: boolean;
  filesChecked: number;
  entities: string[];
  issues: OntologyIssue[];
};

export type GeneratedReadTool = {
  name: string;
  entity: string;
  kind: "read";
  description: string;
  /** Zod-like JSON schema shape for MCP registration (string fields). */
  inputSchema: Record<string, { type: string; description?: string; optional?: boolean }>;
  sourcePath: string;
};

/** MCP write tool def emitted for LOW + NATIVE kinetic actions (gated at runtime). */
export type GeneratedWriteTool = {
  name: string;
  entity: string;
  kind: "write";
  description: string;
  kinetic: true;
  kinetic_level: string;
  blast_radius?: string;
  rollback_protocol?: string;
  executor: string;
  requires_mandate?: boolean;
  mandate_type?: string;
  audit_level?: string;
  inputSchema: Record<
    string,
    { type: string; description?: string; optional?: boolean; values?: string[] }
  >;
  sourcePath: string;
};

export type OntologyGenerateResult = {
  tools: GeneratedReadTool[];
  /** LOW + NATIVE kinetic writes — catalog only until `CLAWQL_ENABLE_ONTOLOGY_WRITES=1`. */
  writeTools: GeneratedWriteTool[];
  /** Writes not yet shippable as MCP (non-NATIVE executor, non-LOW, etc.). */
  deferredWriteActions: {
    entity: string;
    name: string;
    sourcePath: string;
    reason?: string;
  }[];
  entities: string[];
};
