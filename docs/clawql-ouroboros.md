# `clawql-ouroboros` — evolutionary loop library

**npm consumers:** the **registry README** lives in [`packages/clawql-ouroboros/README.md`](../packages/clawql-ouroboros/README.md) (install, quick start, export table, scope vs Q00). This file is the **longer guide** with full examples.

TypeScript workspace package at [`packages/clawql-ouroboros`](../packages/clawql-ouroboros): **specification-first** seeds, **Wonder / Reflect** hooks, an **evolutionary loop** over pluggable **Executor** / **Evaluator**, **ontology convergence** (similarity, stagnation, oscillation, regression gates), and optional **MCP-shaped tool definitions** for crystallizing document text into seeds.

**This is not the full [Q00/ouroboros](https://github.com/Q00/ouroboros) Python product** (interview CLI, PAL routing, Double Diamond execution, LiteLLM, SQL event store, plugin, TUI, and so on). The ClawQL package is a **portable subset** aimed at embedding inside **ClawQL** and other Node runtimes. Conceptual overlap (seed, wonder/reflect, convergence) is intentional; API and feature parity are not.

**Status:** The **`clawql-mcp`** server does **not** register Ouroboros MCP tools yet. You import the library from another app or future ClawQL integration. Published npm name: **`clawql-ouroboros`** (see `packages/clawql-ouroboros/package.json`).

---

## Install

**From this monorepo** (workspace):

```json
{
  "dependencies": {
    "clawql-ouroboros": "workspace:*"
  }
}
```

Then `import { EvolutionaryLoop, … } from 'clawql-ouroboros'`.

**After publish to npm** (when you ship it):

```bash
npm install clawql-ouroboros
```

**Build** (from repo root): `npm run build -w clawql-ouroboros` (also runs as part of `npm run build`).

---

## Package entrypoints

| Import path                  | Purpose                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `clawql-ouroboros`           | `SeedSchema`, types, `EvolutionaryLoop`, `ConvergenceCriteria`, `InMemoryEventStore`, interfaces         |
| `clawql-ouroboros/mcp-hooks` | `ouroborosMcpTools` — Zod schemas + handlers; wire to your MCP server with a typed `OuroborosContext`    |
| `clawql-ouroboros/poller`    | `startSeedsPoller` — interval worker; you supply `fetchPending` / `markFailed` (e.g. Drizzle + Postgres) |

---

## Core concepts

1. **Seed** — Validated object (`SeedSchema`): goal, task type, brownfield context, constraints, acceptance criteria, ontology fields, evaluation principles, exit conditions, metadata (`seed_id`, lineage).
2. **Generation** — One pass: **execute**(seed) → string output → **evaluate**(output, seed) → `EvaluationSummary` (per–acceptance-criterion results + optional score).
3. **Wonder / Reflect** — From generation 2 onward: **wonder**(seed, prior eval) suggests insights; **reflect** produces `Partial<Seed>` updates and a new `seed_id` (child of previous).
4. **EventStore** — Append-only events; **`getLineage(rootSeedId)`** rebuilds `OntologyLineage` for convergence. **`InMemoryEventStore`** is included for tests and prototypes.
5. **Convergence** — `ConvergenceCriteria` compares ontology between completed generations (weighted field similarity), optional eval/regression/wonder gates, stagnation and oscillation shortcuts, and a hard **max generations** cap.

---

## Example 1 — Minimal loop (in-memory store, stub engines)

```typescript
import { EvolutionaryLoop, InMemoryEventStore, SeedSchema, type Seed } from "clawql-ouroboros";

const store = new InMemoryEventStore();

const seed: Seed = SeedSchema.parse({
  goal: "Return a one-line greeting",
  task_type: "code",
  brownfield_context: {
    project_type: "greenfield",
    context_references: [],
    existing_patterns: [],
    existing_dependencies: [],
  },
  constraints: [],
  acceptance_criteria: ["Output contains the word hello"],
  ontology_schema: {
    name: "GreetingOntology",
    description: "Single field",
    fields: [
      {
        name: "greeting",
        field_type: "string",
        description: "friendly hello phrase",
        required: true,
      },
    ],
  },
  evaluation_principles: [],
  exit_conditions: [],
  metadata: {},
});

const loop = new EvolutionaryLoop(
  store,
  {
    wonder: async () => ({
      insights: [],
      suggested_refinements: [],
      requires_evolution: false,
    }),
  },
  {
    reflect: async () => ({ newSeedData: {}, rationale: "noop" }),
  },
  {
    execute: async () => "hello from executor",
  },
  {
    evaluate: async (_out, s) => ({
      final_approved: true,
      score: 0.9,
      ac_results: s.acceptance_criteria.map((c, i) => ({
        ac_index: i,
        ac_content: c,
        passed: true,
        evidence: "ok",
      })),
    }),
  },
  { minGenerations: 2, maxGenerations: 8, convergenceThreshold: 0.95 }
);

const result = await loop.run(seed);
console.log(result.converged, result.generations.length, result.lineage.status);
```

**Per-run overrides** (e.g. tighter cap from an MCP tool):

```typescript
await loop.run(seed, { maxGenerations: 4, convergenceThreshold: 0.92 });
```

---

## Example 2 — `ConvergenceCriteria` only

```typescript
import { ConvergenceCriteria } from "clawql-ouroboros";
import type { OntologyLineage } from "clawql-ouroboros";

// Build or load `lineage` from your EventStore implementation.
const criteria = new ConvergenceCriteria({
  convergenceThreshold: 0.95,
  minGenerations: 2,
  evalGateEnabled: true,
  evalMinScore: 0.7,
});

const signal = criteria.evaluate(
  lineage,
  latestWonderOutput,
  latestEvaluation,
  optionalValidationText
);
// signal.converged, signal.reason, signal.ontology_similarity, …
```

---

## Example 3 — MCP-style helpers (`mcp-hooks`)

`ouroborosMcpTools` exposes **`createSeedFromDocument`**, **`runEvolutionaryLoop`**, **`getLineageStatus`** with Zod input schemas. You pass an **`OuroborosContext`** (`{ ouroborosLoop, eventStore }`) when registering handlers on your MCP server (same pattern as other tools: map `name` → handler + schema).

```typescript
import { ouroborosMcpTools } from "clawql-ouroboros/mcp-hooks";
import { EvolutionaryLoop, InMemoryEventStore } from "clawql-ouroboros";

// Build loop + store once per process (or per tenant).
const eventStore = new InMemoryEventStore();
const ouroborosLoop = new EvolutionaryLoop(
  eventStore,
  wonderEngine,
  reflectEngine,
  executor,
  evaluator
);

const ctx = { ouroborosLoop, eventStore };

// Pseudocode: register each tool with @modelcontextprotocol/sdk
const create = ouroborosMcpTools.createSeedFromDocument;
// registerTool({ name: create.name, inputSchema: zodToJsonSchema(create.inputSchema), handler: (args) => create.handler(args, ctx) })
```

`createSeedFromDocument` bootstraps a valid **Seed** from document id + extracted text + optional metadata (lightweight ontology field inference; replace with a real Wonder pipeline when you have an LLM).

---

## Example 4 — Background poller (`poller`)

```typescript
import { startSeedsPoller } from "clawql-ouroboros/poller";
import type { Seed } from "clawql-ouroboros";

const { stop } = startSeedsPoller(
  ouroborosLoop,
  async (): Promise<Seed[]> => {
    /* SELECT … FROM seeds WHERE status = 'pending' */
    return [];
  },
  async (seedId, err) => {
    /* UPDATE seeds SET status = 'failed', last_error = … */
  },
  { pollIntervalMs: 5000, onError: async (s, e) => console.error(s.metadata.seed_id, e) }
);

// On shutdown:
stop();
```

---

## Production notes

- **Persistence:** Implement **`EventStore`** against Postgres (or reuse patterns from ClawQL’s other persistence) so lineages survive restarts and `getLineage` stays consistent with **`generation_completed`** / **`ouroboros_finished`** events the loop appends.
- **Executor / Evaluator:** Should call your real side effects (e.g. ClawQL **`search`/`execute`** graph, Paperless, GitHub, Slack, **Onyx**). Stubbed executors are fine for tests only.
- **Naming:** Package is **`clawql-ouroboros`** to avoid implying a full TypeScript port of upstream **Q00/ouroboros**.

---

## See also

- **[`docs/mcp-tools.md`](mcp-tools.md)** — ClawQL MCP tools (separate from this library until integrated).
- **[`packages/mcp-grpc-transport/README.md`](../packages/mcp-grpc-transport/README.md)** — other publishable workspace package.
- **Slides / roadmap copy:** [`docs/clawql-slides.md`](clawql-slides.md) (Ouroboros narrative; cross-check shipped vs roadmap).
