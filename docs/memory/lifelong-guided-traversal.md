# Lifelong Guided Traversal (Memory 2.0 — P2)

**Status:** Design locked (plan) — **not implemented**  
**Landing zone:** Memory 2.0 **P2-A** (after P0–P1 stability / Coordinator foundation)  
**Inspiration:** [_Lifelong LaCAM with Local Guidance for Lifelong MAPF_](https://arxiv.org/abs/2605.16855) (arXiv:2605.16855, May 2026)  
**Complements:** [Code graph / Graphify](../plugins/codegraph.md) (structural skeleton) + vault wikilinks + optional vectors

---

## Summary

Treat multi-hop knowledge-graph recall as **lifelong multi-agent pathfinding (MAPF) in semantic space**, not as a stateless “retrieve and dump” query.

- **Graphify / codegraph / vault wikilinks** → build the graph (structure).
- **Lifelong guided traversal** → navigate the graph efficiently across turns and across Ouroboros agents (kinetic intelligence).

Goal: scale `memory_recall` / future `recallGraph` with agent **cognitive change**, not vault size — warm-start frontiers, receding-horizon expansion, local guidance (SGDOP / reputation / Langfuse ROI), and soft collision avoidance for Semantic GDOP. Directly supports [token efficiency](../architecture/clawql-token-efficiency.md) by pruning dead-end branches before they enter context.

---

## Why this paper maps

Lifelong MAPF keeps agents moving in dynamic environments via:

1. **Receding-horizon planning** — plan only a limited window ahead.
2. **Warm-starting** — reuse the previous timestep’s solution as the next search seed.
3. **Local guidance** — bias expansion toward productive regions; avoid deadlocks/collisions.
4. **Lifelong maintenance** — keep searching cheap as the environment grows.

In ClawQL, an agent traversing vault/codegraph nodes is the “robot”; the knowledge graph is the “map”; Ouroboros agents sharing one vault are a multi-agent swarm that must not converge on identical context windows.

---

## Concept → ClawQL mapping (locked)

| Lifelong MAPF concept                | ClawQL equivalent                                                                                           | Implementation notes / payoff                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Receding-horizon planning**        | Bounded `maxDepth` / `horizonDepth` + iterative refine across turns                                         | Expand 1–3 hops, score relevance, expand or backtrack. Prevents context bloat. |
| **Warm-starting**                    | Cache frontier / last-traversed IDs in `MemoryCache` or vault frontmatter (`TraversalState`)                | Turn cold BFS into O(k) local adjustment across related turns.                 |
| **Local guidance**                   | Bias priority with Ouroboros directives: SGDOP blind-spot vector, ReputationUpdate, Langfuse high-ROI paths | Nodes fill swarm blind spots / historical success paths first.                 |
| **Conflict avoidance (LaCAM-style)** | Gateway / ActiveContextRegistry de-duplication of overlapping subgraphs                                     | Lower latency; force Semantic GDOP (diversity).                                |
| **Lifelong maintenance**             | Distillation + hierarchical graph (coarse distilled nodes → fine verbatim)                                  | Distillation = graph simplification for coarse planning.                       |

**Explicit non-goal:** Port the full LaCAM algorithm. Adopt **heuristics** (warm-start, horizon, guidance, soft repulsion) — not robotics-grade conflict trees.

---

## Strategic placement

| Phase     | Scope                                                                        | Traversal work?                              |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| **P0–P1** | PEP/Watchdog, Coordinator foundation, gateway stability                      | **No** — do not block on router work         |
| **P2-A**  | Semantic pruning / distillation as guided exploration                        | **Yes** — interface + `LifelongMemoryRouter` |
| **P2-B**  | Fidelity / retention using guidance to keep high-density path nodes verbatim | **Yes** — policy feeds retention             |
| **P3+**   | Full Ouroboros loop wiring (Evaluate → persist topology → next Wonder)       | Advanced policies + NATS broadcast           |

**Pairing with Graphify:** Graphify/codegraph produces high-fidelity structural edges; lifelong traversal is how swarms _move_ on that skeleton without re-reading the world each turn.

---

## Locked interface contract (P2-A)

Cross-layer objects: **`TraversalPolicy`** (input) and **`TraversalState`** (persisted warm-start + audit). Every runtime (MCP gateway, Pi, Goose, Hermes, OpenClaw) should speak “path exploration,” not only “query retrieval.”

### Zod sketches (transport perimeter)

```ts
import { z } from "zod";

export const TraversalTrajectorySchema = z
  .object({
    previousPathNodeIds: z.array(z.string()).default([]),
    velocityVector: z.array(z.number()).optional(),
    velocityMagnitude: z.number().min(0).default(0),
  })
  .default({ previousPathNodeIds: [], velocityMagnitude: 0 });

export const TraversalPolicySchema = z.object({
  policyMode: z
    .enum(["basic_bfs", "warm_start_adaptive", "receding_horizon_guided"])
    .default("receding_horizon_guided"),
  horizonDepth: z.number().int().min(1).max(5).default(2),
  maxTokens: z.number().int().positive().default(4000),
  /** Cosine-distance-style radius for peer-context collision penalties (gateway). */
  collisionRadius: z.number().min(0).max(1).optional().default(0.25),
  trajectory: TraversalTrajectorySchema,
  /** Coordinator-broadcast consensus / blind-spot direction in embedding space. */
  swarmTargetRegion: z.array(z.number()).optional(),
  /** Node id → boost (or negative repulsion for collision avoidance). */
  guidanceWeights: z.record(z.string(), z.number()).optional(),
});

export const TraversalStateSchema = z.object({
  currentRoot: z.string(),
  searchFrontier: z.array(z.string()),
  velocityVector: z.array(z.number()),
  horizonDepth: z.number().int(),
  /** Fast path signature today; prefer Merkle/SHA for WORM later. */
  lastPathSignature: z.string(),
});
```

### Router behavior (normative sketch)

`LifelongMemoryRouter.recallGraphWithGuidance(queryEmbedding, policy)`:

1. **Warm-start** — seed frontier from `trajectory.previousPathNodeIds` when present; else semantic entry node (cold start / generation 0).
2. **Receding horizon** — expand adjacency (wikilinks / graph edges) only while `depth < horizonDepth` and under `maxTokens`.
3. **Local guidance score** (illustrative blend) — `0.5·query` + `0.3·momentum` + `0.2·swarmTarget` + manual `guidanceWeights`.
4. **Return** — `{ activeNodeIds, traversedPath, newState }` so the caller persists `newState` for the next turn and submits `lastPathSignature` to audit.

Always keep **`basic_bfs`** as fallback for cold/malformed warm-start.

### MCP surface (future)

Expose as an evolved `memory_recall` policy and/or dedicated `recallGraph` / `continueTraversal` tools:

- `policyMode`, `horizonDepth`, `maxTokens`
- `warmStartFrom` / `trajectory` (prior frontier)
- `localGuidance` / `guidanceWeights` + optional `swarmTargetRegion`
- Response includes `warmStartState` / `traversedPath` / `lastPathSignature`

Gateway may inject swarm bias via an **ActiveContextRegistry** (in-memory / Redis): peer path node IDs → negative `guidanceWeights` (repulsion), enforcing diversity without blocking progress.

---

## Ouroboros integration

| Loop phase           | Traversal role                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Wonder / Reflect** | Call guided recall with prior `TraversalState` + coordinator `swarmTargetRegion`                                                          |
| **Execute**          | Fetch only `activeNodeIds` content under token budget                                                                                     |
| **Evaluate**         | Persist `newState` + `traversedPath` (vault frontmatter `topology_trace` or MemoryCache); feed Langfuse ROI into future `guidanceWeights` |
| **Coordinator**      | Broadcast blind-spot / consensus vector; compute collision penalties from ActiveContextRegistry                                           |

Collision avoidance here is **cognitive**: prevent agents from fetching near-identical subgraphs — the LaCAM intuition applied to Semantic GDOP, not physical robots.

---

## Memory 2.0 distillation tie-in

- **P2-A Semantic pruning:** Distillation search strategy = guided exploration (not blind summarization).
- **P2-B Fidelity/retention:** Prefer verbatim retention for nodes that repeatedly appear on high-ROI traversed paths; distill peripheral nodes first.
- Hierarchical search: Level 1 distilled (coarse) → Level 2 verbatim (fine), mirroring receding-horizon coarse-then-zoom.

---

## Build sequence (locked)

1. **Interface lock** — Zod/TS schemas for `TraversalPolicy` + `TraversalState` (this document is the contract).
2. **Router** — `LifelongMemoryRouter` in `clawql-memory` (warm-start + horizon + guidance; audit path signature).
3. **MCP wrapper** — validate at transport; return serializable `newState`.
4. **Persist topology** — Evaluate → vault frontmatter / cache; optional WORM of `lastPathSignature`.
5. **Swarm bias** — ActiveContextRegistry + repulsion weights (after Coordinator exists).
6. **Verify** — Synthetic vault graph: warm-start token use vs cold BFS on multi-hop queries.

---

## Evaluation criteria

- Token count for multi-turn related recalls (warm vs cold).
- Recall quality / Langfuse verdict rates on multi-hop tasks.
- Inter-agent subgraph overlap (collision / GDOP proxy) under swarm load.
- Latency of index hits (fewer redundant Onyx/vector fetches).

---

## Related

- [Memory plugin](../plugins/memory.md) — vault + hybrid recall today
- [Code graph / Graphify](../plugins/codegraph.md) — structural graph construction
- [Hybrid memory backends](hybrid-memory-backends.md)
- [Token efficiency](../architecture/clawql-token-efficiency.md) — why lean traversal matters for reasoning quality
- [DAOS unified architecture](../ouroboros/daos-unified-architecture-specification-v2.7.md) — SGDOP, Semantic Pruning, Memory 2.0 (target)
- Paper: [arXiv:2605.16855](https://arxiv.org/abs/2605.16855)

---

## Vault ingest note

When ClawQL MCP vault tools are available, ingest this plan with stable title **`Lifelong Guided Traversal P2`**, wikilinks to Memory 2.0 / Ouroboros / Codegraph notes, and `append: true` for session threading. This repo path is the canonical design source until that ingest lands.
