import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

export const ExitConditionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  evaluation_criteria: z.string().min(1),
});

export const EvaluationPrincipleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0).max(1).default(1.0),
});

export const OntologyFieldSchema = z.object({
  name: z.string().min(1),
  field_type: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(true),
});

export const OntologySchemaSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(OntologyFieldSchema).default([]),
});

export const BrownfieldContextSchema = z.object({
  project_type: z.enum(["greenfield", "brownfield"]).default("greenfield"),
  context_references: z.array(z.unknown()).default([]),
  existing_patterns: z.array(z.string()).default([]),
  existing_dependencies: z.array(z.string()).default([]),
});

export const SeedMetadataSchema = z.object({
  seed_id: z.string().default(() => `seed_${uuidv4().slice(0, 12)}`),
  version: z.string().default("1.0.0"),
  created_at: z.coerce.date().default(() => new Date()),
  ambiguity_score: z.number().min(0).max(1).default(0.15),
  interview_id: z.string().nullable().default(null),
  parent_seed_id: z.string().nullable().default(null),
});

export const SeedSchema = z
  .object({
    goal: z.string().min(1),
    task_type: z.enum(["code", "research", "analysis", "ingest"]).default("code"),
    brownfield_context: BrownfieldContextSchema,
    constraints: z.array(z.string()).default([]),
    acceptance_criteria: z.array(z.string()).default([]),
    ontology_schema: OntologySchemaSchema,
    evaluation_principles: z.array(EvaluationPrincipleSchema).default([]),
    exit_conditions: z.array(ExitConditionSchema).default([]),
    metadata: SeedMetadataSchema,
  })
  .strict();

export type Seed = z.infer<typeof SeedSchema>;
export type OntologyField = z.infer<typeof OntologyFieldSchema>;
export type OntologySchema = z.infer<typeof OntologySchemaSchema>;
