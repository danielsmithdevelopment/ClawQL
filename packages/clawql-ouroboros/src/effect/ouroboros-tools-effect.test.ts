import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "../in-memory-event-store.js";
import type { OuroborosContext } from "../mcp-hooks.js";
import type { Seed } from "../seed.js";
import { OuroborosContextService } from "./ouroboros-context-service.js";
import { OuroborosEventStoreService } from "./ouroboros-event-store-service.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";
import {
  executeCreateSeedFromDocumentEffect,
  executeMeasureDriftEffect,
  executeProposeSeedRevisionFromEvalEffect,
} from "./ouroboros-tools-effect.js";
import { OuroborosToolsService, ouroborosToolsLiveLayer } from "./ouroboros-tools-service.js";

const toolsOnlyLayer = ouroborosToolsLiveLayer();

const stubContext = {} as OuroborosContext;

const testLayer = Layer.mergeAll(
  Layer.succeed(
    OuroborosContextService,
    OuroborosContextService.of({ getContext: () => stubContext })
  ),
  toolsOnlyLayer
);

function minimalSeed(seedId: string): Seed {
  return {
    goal: "Ship secure GitHub release workflow",
    task_type: "analysis",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: ["No secrets in git"],
    acceptance_criteria: [],
    ontology_schema: {
      name: "o",
      description: "d",
      fields: [
        { name: "workflow", field_type: "string", description: "Actions workflow", required: true },
      ],
    },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: seedId,
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
    },
  };
}

function eventStoreTestLayer(store: InMemoryEventStore) {
  return Layer.mergeAll(
    Layer.succeed(
      OuroborosEventStoreService,
      OuroborosEventStoreService.of({
        getStore: () => store,
        append: (event) => ouroborosFromPromise(() => store.append(event)),
        getLineage: (seedId) => ouroborosFromPromise(() => store.getLineage(seedId)),
      })
    ),
    ouroborosToolsLiveLayer()
  );
}

describe("executeCreateSeedFromDocumentEffect", () => {
  it("builds a seed via OuroborosToolsService", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const tools = yield* OuroborosToolsService;
        return yield* tools.createSeedFromDocument({
          documentId: "doc-effect",
          extractedText: "Effect bridge test document with enough tokens",
          goalHint: "Effect goal",
          metadata: {},
          taskType: "analysis",
        });
      }).pipe(Effect.provide(testLayer))
    );
    expect(result).toMatchObject({ success: true });
    if ("success" in result && result.success) {
      expect(result.seed.goal).toBe("Effect goal");
    }
  });

  it("executeCreateSeedFromDocumentEffect builds seed without context service", async () => {
    const result = await Effect.runPromise(
      executeCreateSeedFromDocumentEffect({
        documentId: "doc-ctx",
        extractedText: "Context service wiring validation text",
        metadata: {},
        taskType: "ingest",
      }).pipe(Effect.provide(toolsOnlyLayer))
    );
    expect(result).toMatchObject({ success: true });
  });
});

describe("executeProposeSeedRevisionFromEvalEffect", () => {
  it("proposes a dry-run revision via EventStoreService", async () => {
    const store = new InMemoryEventStore();
    const base = minimalSeed("seed-propose-effect");
    base.evaluation_principles = [{ name: "accuracy", description: "score", weight: 1 }];

    const res = await Effect.runPromise(
      executeProposeSeedRevisionFromEvalEffect({
        scoreName: "accuracy",
        scoreValue: 0.95,
        seedId: "seed-propose-effect",
        autoApply: false,
        minScore: 0.8,
        baseSeed: base,
      }).pipe(Effect.provide(eventStoreTestLayer(store)))
    );

    expect(res.ok).toBe(true);
    expect(res.action).toBe("proposed");
    expect(res.dryRun).toBe(true);
    expect(
      store.snapshot("seed-propose-effect").some((e) => e.type === "langfuse_eval_received")
    ).toBe(true);
  });

  it("returns ok:false when eval payload is missing", async () => {
    const store = new InMemoryEventStore();
    const res = await Effect.runPromise(
      executeProposeSeedRevisionFromEvalEffect({}).pipe(Effect.provide(eventStoreTestLayer(store)))
    );
    expect(res).toMatchObject({
      ok: false,
      error: "Missing eval: provide `payload` or `scoreValue` (+ optional scoreName/seedId)",
    });
  });
});

describe("executeMeasureDriftEffect", () => {
  it("persists drift_measured via OuroborosEventStoreService", async () => {
    const store = new InMemoryEventStore();
    const root = minimalSeed("seed-drift-effect");
    await store.append({
      type: "generation_completed",
      seed_id: "seed-drift-effect",
      data: {
        generation_number: 1,
        seed: root,
        execution_output: "ok",
        evaluation_summary: {
          final_approved: true,
          score: 0.9,
          ac_results: [{ ac_index: 0, ac_content: "pass", passed: true, evidence: "ok" }],
        },
        phase: "completed",
        ontology_schema: root.ontology_schema,
      },
    });

    const res = await Effect.runPromise(
      executeMeasureDriftEffect({
        seedId: "seed-drift-effect",
        currentOutput: "GitHub Actions workflow without secrets in git",
        constraintViolations: [],
        currentConcepts: ["workflow"],
        persistEvent: true,
      }).pipe(Effect.provide(eventStoreTestLayer(store)))
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.combined_drift).toBeTypeOf("number");
    }
    expect(store.snapshot("seed-drift-effect").some((e) => e.type === "drift_measured")).toBe(true);
  });

  it("skips persist when persistEvent is false", async () => {
    const store = new InMemoryEventStore();
    const root = minimalSeed("seed-drift-nopersist");
    await store.append({
      type: "generation_completed",
      seed_id: "seed-drift-nopersist",
      data: {
        generation_number: 1,
        seed: root,
        execution_output: "ok",
        evaluation_summary: {
          final_approved: true,
          score: 0.9,
          ac_results: [],
        },
        phase: "completed",
        ontology_schema: root.ontology_schema,
      },
    });

    const res = await Effect.runPromise(
      executeMeasureDriftEffect({
        seedId: "seed-drift-nopersist",
        currentOutput: "GitHub Actions workflow",
        constraintViolations: [],
        currentConcepts: ["workflow"],
        persistEvent: false,
      }).pipe(Effect.provide(eventStoreTestLayer(store)))
    );

    expect(res.ok).toBe(true);
    expect(store.snapshot("seed-drift-nopersist").some((e) => e.type === "drift_measured")).toBe(
      false
    );
  });

  it("returns ok:false when baseline cannot be resolved", async () => {
    const store = new InMemoryEventStore();
    const res = await Effect.runPromise(
      executeMeasureDriftEffect({
        currentOutput: "some output",
        constraintViolations: [],
        currentConcepts: [],
        persistEvent: true,
      }).pipe(Effect.provide(eventStoreTestLayer(store)))
    );
    expect(res).toEqual({
      ok: false,
      error: "Provide `seed`, `seedId` with lineage events, or `seedContent`",
    });
  });
});
