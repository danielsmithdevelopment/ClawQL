import { v4 as uuidv4 } from "uuid";
import { SeedSchema, type Seed } from "../seed.js";

export type CreateSeedFromDocumentInput = {
  documentId: string;
  extractedText: string;
  metadata: Record<string, unknown>;
  goalHint?: string;
  taskType: "code" | "research" | "analysis" | "ingest";
};

export type CreateSeedFromDocumentResult =
  { success: true; seed: Seed } | { success: false; error: string };

export function deriveGoal(
  documentId: string,
  metadata: Record<string, unknown>,
  goalHint?: string
): string {
  if (goalHint) return goalHint;
  const title =
    (metadata["title"] as string | undefined) ??
    (metadata["filename"] as string | undefined) ??
    (metadata["subject"] as string | undefined);
  if (title) return `Extract and evolve structured knowledge from: ${title}`;
  return `Process and evolve knowledge from document ${documentId}`;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
  "if",
  "then",
  "than",
  "so",
  "not",
  "no",
  "yes",
  "all",
  "any",
  "each",
  "some",
  "such",
  "other",
  "also",
  "into",
  "about",
  "up",
  "out",
  "over",
  "after",
  "before",
  "between",
  "through",
  "during",
]);

export function inferOntologyFields(
  text: string,
  maxFields = 8
): Array<{ name: string; field_type: string; description: string; required: boolean }> {
  const freq = new Map<string, number>();

  for (const token of text.toLowerCase().split(/\W+/)) {
    if (token.length < 4) continue;
    if (STOP_WORDS.has(token)) continue;
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  const candidates = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFields)
    .map(([name]) => ({
      name,
      field_type: "string",
      description: `Extracted concept: ${name}`,
      required: false,
    }));

  return [
    {
      name: "content_summary",
      field_type: "string",
      description: "Summary of document content",
      required: true,
    },
    {
      name: "document_id",
      field_type: "string",
      description: "Source document identifier",
      required: true,
    },
    ...candidates,
  ];
}

/** Build a Seed from extracted document text (pure; no EventStore). */
export function createSeedFromDocumentCore(
  input: CreateSeedFromDocumentInput
): CreateSeedFromDocumentResult {
  try {
    const goal = deriveGoal(input.documentId, input.metadata, input.goalHint);
    const fields = inferOntologyFields(input.extractedText);

    const raw = {
      goal,
      task_type: input.taskType,
      brownfield_context: {
        project_type: "brownfield" as const,
        context_references: [input.documentId],
        existing_patterns: [],
        existing_dependencies: [],
      },
      constraints: ["Preserve semantic fidelity to source document"],
      acceptance_criteria: [
        "Ontology fields cover main topics of the document",
        "Ontology similarity convergence >= 0.92",
      ],
      ontology_schema: {
        name: `DocumentOntology_${input.documentId}`,
        description: `Knowledge ontology extracted from document ${input.documentId}`,
        fields,
      },
      evaluation_principles: [
        {
          name: "Semantic fidelity",
          description: "Output faithfully represents source content",
          weight: 0.6,
        },
        {
          name: "Ontology completeness",
          description: "Key entities and relations captured",
          weight: 0.4,
        },
      ],
      exit_conditions: [
        {
          name: "High similarity",
          description: "Ontology stable across generations",
          evaluation_criteria: "Similarity >= 0.95 for 2+ generations",
        },
      ],
      metadata: {
        seed_id: `docseed_${input.documentId}_${uuidv4().slice(0, 8)}`,
        version: "1.0.0",
        created_at: new Date(),
        ambiguity_score: Math.min(0.8, 500 / Math.max(input.extractedText.length, 1)),
        interview_id: null,
        parent_seed_id: null,
      },
    };

    const parsed = SeedSchema.parse(raw);
    return { success: true, seed: parsed };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
