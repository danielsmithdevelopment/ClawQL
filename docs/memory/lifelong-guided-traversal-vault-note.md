# Vault note: Lifelong Guided Traversal (session lock)

> Staging note for `memory_ingest` when ClawQL vault MCP is configured.
> Canonical design: [`lifelong-guided-traversal.md`](./lifelong-guided-traversal.md).

## Summary

Locked Memory 2.0 **P2** navigation plan: treat multi-hop graph recall as lifelong MAPF-style pathfinding (receding horizon, warm-start, local guidance, soft collision avoidance). Inspired by Lifelong LaCAM (arXiv:2605.16855). Complements Graphify/codegraph structure with kinetic traversal. Not P0–P1 work.

## Tags / topics

#clawql #memory-2 #ouroboros #mapf #lifelong-lacam #token-efficiency #sgdop #graphify #p2

## Decisions

- Adopt MAPF **heuristics**, not a full LaCAM port.
- Cross-layer contracts: `TraversalPolicy` + `TraversalState` (Zod at MCP perimeter).
- Policies: `basic_bfs` | `warm_start_adaptive` | `receding_horizon_guided`.
- Landing zone: **P2-A** semantic pruning / guided distillation; **P2-B** fidelity using path density.
- Graphify builds skeleton; lifelong traversal navigates it.
- Persist `newState` / `traversedPath` / `lastPathSignature` for warm-start + WORM audit.
- Gateway ActiveContextRegistry applies repulsion weights for Semantic GDOP.

## Follow-ups

- [ ] `memory_ingest` title `Lifelong Guided Traversal P2` when vault MCP available
- [ ] Implement Zod schemas in `clawql-memory`
- [ ] Prototype `LifelongMemoryRouter` + synthetic-vault token benchmark
- [ ] Wire Ouroboros Evaluate → topology_trace persistence after Coordinator exists

## Related titles (wikilinks)

- Lifelong Guided Traversal P2
- Memory 2.0
- Ouroboros Coordinator
- Codegraph Graphify
- Token Efficiency Twelve Layers
- SGDOP Semantic Blind Spots
