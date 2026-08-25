/**
 * Runtime CQE entity types shared by Layer 1–3 meta-ontology.
 * Distinct from YAML {@link OntologyEntityDocument} — these are the in-index shapes.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md
 */

export type CQEFieldType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "ISODate"
  | "ISODateTime"
  | "URL"
  | "Integer"
  | "Percentage";

export type CQEEntitySource =
  | "layer1"
  | "json_schema"
  | "json_schema_cold"
  | "document_structure"
  | "meta_ontology";

export type CQEField = {
  name: string;
  type: CQEFieldType;
  nullable: boolean;
  description?: string;
  examples?: unknown[];
  /** Docling bounding box or other provenance hint. */
  sourceLocation?: unknown;
  reliability?: number;
};

export type CQERelationshipType = "repeated" | "one_to_many" | "many_to_one" | "one_to_one";

export type CQERelationship = {
  name: string;
  type: CQERelationshipType;
  targetEntity: string;
  description?: string;
  /** Hint for completeness checking (table row count). */
  rowCount?: number;
};

export type CQEEntity = {
  id: string;
  source: CQEEntitySource;
  fields: CQEField[];
  relationships: CQERelationship[];
  sourceHash?: string;
  nullable?: string[];
  required?: string[];
  scaffoldedAt?: string;
  sessionId?: string;
  documentType?: string;
  evidenceCount?: number;
  avgCriterionPassRate?: number;
};

export type ScaffoldTtl = "session" | "permanent" | number;

export type ScaffoldOptions = {
  entityId?: string;
  sessionId?: string;
  documentType?: string;
  ttl?: ScaffoldTtl;
  overwrite?: boolean;
};

export type ScaffoldResult = {
  entity: CQEEntity;
  entityId: string;
  fieldCount: number;
  relationshipCount: number;
  source?: CQEEntitySource;
  evidenceCount?: number;
  avgCriterionPassRate?: number;
};

export type RegisterDynamicOptions = {
  ttl?: ScaffoldTtl;
  overwrite?: boolean;
};

export type PopulateResult = {
  populatedFields: string[];
  nullFields: string[];
  rowsPopulated: Record<string, number>;
};

/** Minimal JSON Schema subset used for Layer 2 scaffolding. */
export type JSONSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  examples?: unknown[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  title?: string;
  $id?: string;
  [key: string]: unknown;
};

/** Minimal Docling-like extraction shape for Layer 2 document scaffolding. */
export type DoclingFormField = {
  label: string;
  value?: unknown;
  boundingBox?: unknown;
};

export type DoclingTableHeader = {
  text: string;
};

export type DoclingTable = {
  index: number;
  headers: DoclingTableHeader[];
  rows: unknown[][];
};

export type DoclingOutput = {
  formFields?: DoclingFormField[];
  tables?: DoclingTable[];
  title?: string;
};

export type QueryGoal = "enumerate_all" | "find_specific" | "check_null";

export type QueryPattern = {
  entityId: string;
  filterSignature: string;
  filters: Record<string, unknown>;
  successCount: number;
  attemptCount: number;
  avgResultCount: number;
  avgCriterionPassRate: number;
  goal?: QueryGoal;
  lesson?: string;
};

export type FieldReliability = {
  entityId: string;
  fieldName: string;
  documentType: string | null;
  extractionCount: number;
  nullCount: number;
  successCount: number;
  reliabilityScore: number;
};

export type FailurePattern = {
  entityId: string;
  patternType: "early_termination" | "null_fields" | "wrong_strategy" | string;
  patternDescription: string;
  occurrenceCount: number;
  lastSeen: string;
};

export type PromotionCandidate = {
  documentType: string;
  entity: CQEEntity;
  evidenceCount: number;
  avgCriterionPassRate: number;
  suggestedCQEPath: string;
};
