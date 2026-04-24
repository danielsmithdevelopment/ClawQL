# clawql-ouroboros

**Specification-first evolutionary workflows in TypeScript** — immutable **Seeds** (Zod), pluggable **Wonder / Reflect** and **Executor / Evaluator**, an **EvolutionaryLoop** that runs until **ontology convergence** (similarity, stagnation, oscillation, regression gates), plus optional **MCP-oriented tool definitions** and a **background poller** helper.

**Works as a standalone npm library today.** You do **not** need the ClawQL MCP server: bring your own `EventStore`, LLM calls inside Wonder/Reflect, and real side effects inside `Executor`. ClawQL uses this package as one consumer; others can embed the same loop in agents, job workers, or internal tools.

| Resource | Link |
| -------- | ---- |
| **Long-form guide + copy-paste examples** | [docs/clawql-ouroboros.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/clawql-ouroboros.md) |
| **Human-friendly overview (ClawQL docs site)** | [docs.clawql.com/ouroboros](https://docs.clawql.com/ouroboros) |
| **Source** | [packages/clawql-ouroboros](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-ouroboros) |
| **Issues / discussions** | [ClawQL issues](https://github.com/danielsmithdevelopment/ClawQL/issues) |

## Requirements

- **Node.js ≥ 22**
- **ESM** (`"type": "module"`) or bundlers that consume **dual ESM + CJS** builds

## Install

**Published registry** (when this package is published to npm):

```bash
npm install clawql-ouroboros
```

**Inside the ClawQL monorepo** (workspace):

```json
{ "dependencies": { "clawql-ouroboros": "workspace:*" } }
```

**Before publish / for CI smoke tests** — from a clone, build then install the tarball:

```bash
cd packages/clawql-ouroboros && npm run build && npm pack
# elsewhere: npm install /path/to/clawql-ouroboros-0.1.0.tgz
```

Installing the **root** repo with `npm install github:danielsmithdevelopment/ClawQL` pulls **`clawql-mcp`**, not this subpackage by name; use **`workspace:`**, a **`.tgz`**, or the registry once **`clawql-ouroboros`** is published.

## What you get

| Export path | Use case |
| ----------- | -------- |
| **`clawql-ouroboros`** | `SeedSchema`, types, `EvolutionaryLoop`, `ConvergenceCriteria`, `RegressionDetector`, `InMemoryEventStore`, interfaces |
| **`clawql-ouroboros/mcp-hooks`** | `ouroborosMcpTools` — Zod input schemas + async handlers for seed-from-document, run loop, lineage query (wire to [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) yourself) |
| **`clawql-ouroboros/poller`** | `startSeedsPoller` — `setInterval` worker; you supply `fetchPending(): Promise<Seed[]>` and `markFailed(seedId, err)` |

**Runtime dependencies:** `zod` ^4, `uuid` ^11 (declared in this package’s `package.json`).

## Minimal example

```typescript
import {
  EvolutionaryLoop,
  InMemoryEventStore,
  SeedSchema,
} from "clawql-ouroboros";

const store = new InMemoryEventStore();

const seed = SeedSchema.parse({
  goal: "Produce a one-line greeting",
  task_type: "code",
  brownfield_context: {
    project_type: "greenfield",
    context_references: [],
    existing_patterns: [],
    existing_dependencies: [],
  },
  constraints: [],
  acceptance_criteria: ["Output mentions hello"],
  ontology_schema: {
    name: "GreetingOntology",
    description: "One field",
    fields: [
      {
        name: "greeting",
        field_type: "string",
        description: "friendly phrase",
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
  { reflect: async () => ({ newSeedData: {}, rationale: "noop" }) },
  { execute: async () => "hello world" },
  {
    evaluate: async (_out, s) => ({
      final_approved: true,
      score: 0.95,
      ac_results: s.acceptance_criteria.map((c, i) => ({
        ac_index: i,
        ac_content: c,
        passed: true,
        evidence: "ok",
      })),
    }),
  },
  { minGenerations: 2, maxGenerations: 10, convergenceThreshold: 0.95 },
);

const result = await loop.run(seed);
// result.converged, result.generations, result.lineage, result.finalSeed
```

**Per-run caps** (e.g. from an HTTP handler):

```typescript
await loop.run(seed, { maxGenerations: 5, convergenceThreshold: 0.92 });
```

More examples (convergence-only, MCP hooks, poller) are in the **[full guide](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/clawql-ouroboros.md)**.

## What you implement

| Interface | Responsibility |
| --------- | --------------- |
| **`EventStore`** | Append events; **`getLineage(rootSeedId)`** returns a full **`OntologyLineage`**. Use **`InMemoryEventStore`** for tests; use Postgres/Redis/etc. for production. |
| **`WonderEngine`** | Optional refinement signals after each generation (often LLM). |
| **`ReflectEngine`** | Produces **`Partial<Seed>`** updates for the next generation (often LLM). |
| **`Executor`** | Runs the task for the current seed — **your** API calls, sandboxes, or agent tool loop. |
| **`Evaluator`** | Scores output vs acceptance criteria / principles — rules, tests, LLM, or mix. |

The library **does not** call OpenAI, Anthropic, or ClawQL by default; those belong in your adapters.

## Relationship to [Q00/ouroboros](https://github.com/Q00/ouroboros)

The popular **Python** project is a full product (interview CLI, MCP plugin, PAL routing, Double Diamond execution, persistence, TUI, etc.). **`clawql-ouroboros`** is a **small, embeddable TypeScript core**: overlapping *ideas* (seed, wonder/reflect, convergence), **not** feature parity or a claim to be the “official” TS port. The **`clawql-`** prefix scopes naming to this ecosystem.

## Current limitations (honest scope)

- **No** built-in Postgres `EventStore` — implement `append` / `getLineage` yourself.
- **No** built-in LLM — Wonder/Reflect/Evaluate are yours to wire.
- **No** automatic registration on the **`clawql-mcp`** npm binary — that integration is optional and separate.

None of that blocks **reusing the loop + types + convergence math** in your own server today.

## Scripts (contributors / clone)

```bash
npm run build -w clawql-ouroboros
npm run test -w clawql-ouroboros
```

## License

Apache-2.0 — see **`LICENSE`** in this package.
