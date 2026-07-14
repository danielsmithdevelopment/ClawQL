import { v4 as uuidv4 } from "uuid";
import type { EventStore } from "../interfaces.js";
import { SeedSchema, type Seed } from "../seed.js";

export type ResolveBaselineSeedInput = {
  seed?: unknown;
  seedId?: string;
  seedContent?: string;
};

/** Resolve baseline Seed for drift measurement from inline seed, lineage, or free-form content. */
export async function resolveBaselineSeed(
  input: ResolveBaselineSeedInput,
  eventStore: EventStore
): Promise<Seed | null> {
  if (input.seed !== undefined) {
    return SeedSchema.parse(input.seed);
  }

  if (input.seedId) {
    const lineage = await eventStore.getLineage(input.seedId);
    if (lineage.generations.length > 0) {
      return lineage.generations[0]!.seed;
    }
  }

  if (input.seedContent?.trim()) {
    const goalMatch = input.seedContent.match(/goal:\s*["']?([^\n"']+)/i);
    const goal = goalMatch?.[1]?.trim() || "Unspecified goal from seedContent";
    return SeedSchema.parse({
      goal,
      task_type: "analysis",
      brownfield_context: {
        project_type: "brownfield",
        context_references: [],
        existing_patterns: [],
        existing_dependencies: [],
      },
      constraints: [],
      acceptance_criteria: [],
      ontology_schema: { name: "InlineSeed", description: goal, fields: [] },
      evaluation_principles: [],
      exit_conditions: [],
      metadata: {
        seed_id: input.seedId ?? `seed_inline_${uuidv4().slice(0, 8)}`,
        version: "1.0.0",
        created_at: new Date(),
        ambiguity_score: 0.15,
        interview_id: null,
        parent_seed_id: null,
      },
    });
  }

  return null;
}
