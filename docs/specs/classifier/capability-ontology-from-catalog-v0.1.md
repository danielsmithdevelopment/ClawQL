# Capability ontology from live catalog (v0.1)

**Status:** draft spec (implementation not started)  
**Depends on:** Fast Decision Primitive v0.4 §7; plugin `ToolDefinition` / `parameterNotes` pattern ([`docs/design/clawql-core-plugin-architecture.md`](../../design/clawql-core-plugin-architecture.md) §9.3)  
**Replaces:** hand-authored `packages/clawql-core/src/classifier/fixtures/clawql-capability-ontology.json` once generators ship  
**Eval honesty:** see [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](../../../packages/clawql-core/src/classifier/held-out/fixtures/ONTOLOGY_ENRICHMENT_EVAL_LOG.md) — the 2026-09-25 Harvey routing A/B is a **contaminated smoke**, not held-out lift.

---

## 1. Problem

Fast Decision enrichment needs `whenToUse` / `whenNotToUse` (and sibling disambiguation) so GLiNER is not baited by unstructured-shell lexical overlap. Putting that knowledge in a **fixture JSON** next to the classifier:

1. **Drifts** from the live MCP/skill catalog.
2. **Invites contamination** — authors tune fixture text against held-out routing failures (already happened).
3. **Collapses siblings** when many candidate ids alias one catalog row, so shared prose overwrites the only text that distinguished them.

The fix is the same shape as `parameterNotes`: optional fields on the definitions plugins already ship, then **generate** the ontology from the live catalog at build time with a digest.

---

## 2. Plugin interface (additive)

### 2.1 `ToolDefinition` / `McpToolDefinition`

Extend `packages/clawql-core/src/plugin/registration-api.ts` `McpToolDefinition` (and thus `ToolDefinition`):

```typescript
export type ToolRoutingHint = {
  /** When this tool is the right Fast Decision / agent choice. */
  readonly whenToUse?: string;
  /** When this tool must not win (anti-pattern or wrong framing). */
  readonly whenNotToUse?: string;
  /**
   * Sibling disambiguation: named peers this tool must not be confused with.
   * One line per peer — lives with the plugin author, not the eval author.
   */
  readonly distinguishFrom?: ReadonlyArray<{
    readonly toolId: string;
    readonly reason: string;
  }>;
};

export type McpToolDefinition = {
  readonly name: string;
  readonly description?: string;
  readonly schema: Record<string, unknown>;
  readonly handler: McpToolHandler;
  readonly parameterNotes?: Record<string, string>;
  /** Optional Fast Decision / routing hints (additive; existing plugins valid). */
  readonly whenToUse?: string;
  readonly whenNotToUse?: string;
  readonly distinguishFrom?: ToolRoutingHint["distinguishFrom"];
};
```

Rules:

- All three fields are **optional**. Existing plugins stay valid with no code changes.
- Follow the `parameterNotes` precedent: documentation + synthesis quality improve when present; absence is not an error.
- `distinguishFrom[].toolId` must name another registered tool id (or a declared anti-pattern id). Unknown ids fail **build-time** ontology generation (fail closed), not silent drop.
- Hand-written strings must **never** reference eval case IDs, suite ids, or verbatim held-out query text (enforced in CI lints — see §5).

### 2.2 `SkillDefinition`

Extend `packages/clawql-core/src/plugin/provider-types.ts` `SkillDefinition` the same way:

```typescript
export type SkillDefinition = {
  readonly skillId: string;
  readonly content: string;
  readonly purposeTrace?: string;
  readonly applicability?: SkillApplicability;
  readonly name?: string;
  readonly description?: string;
  readonly whenToUse?: string;
  readonly whenNotToUse?: string;
  readonly distinguishFrom?: ReadonlyArray<{
    readonly toolId: string; // skillId or tool id peer
    readonly reason: string;
  }>;
};
```

Skills that are Fast Decision candidates (`skill_fast_path_match`) get catalog rows from these fields; skills without hints still register but contribute only `name`/`description` to generated ontology.

### 2.3 Anti-patterns

Unstructured-shell (and similar) are not MCP tools. Declare them as **catalog anti-pattern entries** in a small core module (e.g. `clawql-core/classifier/anti-patterns.ts`) with the same three fields, generated into the ontology with `kind: "anti_pattern"`. They are not plugin-optional for core-known traps; third parties may register additional anti-patterns via a future `registerAntiPattern` API (out of scope for v0.1 if unused).

---

## 3. Ontology generation (build time)

### 3.1 Generator

`scripts/generate-capability-ontology.mts` (or Effect CLI under `clawql-core`):

1. Collect live catalog: registered / package-declared tools + skills + core anti-patterns (same sources scenario synthesis already sees).
2. Emit `CapabilityOntology` JSON + **SHA-256 digest** of canonicalized content.
3. Write to build output (e.g. `packages/clawql-core/dist/classifier-fixtures/capability-ontology.generated.json`) and a short `capability-ontology.digest` file.
4. **Retire** hand fixture `clawql-capability-ontology.json` once generators are green — keep only as a migration golden until deleted.

### 3.2 Entry shape (generated)

Each entry must carry provenance:

```typescript
export type CapabilityProvenance =
  | { readonly source: "plugin-declared"; readonly pluginId: string }
  | { readonly source: "core-anti-pattern"; readonly id: string }
  | {
      readonly source: "hand-override";
      readonly reason: string;
      /** Required audit; must not cite eval case ids or query text. */
      readonly overrideLogRef: string;
    };

export type GeneratedCapabilityEntry = {
  readonly capabilityId: string;
  readonly kind: "tool" | "skill" | "anti_pattern";
  readonly whenToUse: string;
  readonly whenNotToUse: string;
  readonly distinguishFrom: ReadonlyArray<{ toolId: string; reason: string }>;
  readonly requiresStructuredCorpus: boolean; // derived or declared
  readonly provenance: CapabilityProvenance;
};
```

### 3.3 Enrichment rules (normative)

When packing GLiNER labels:

1. Prefer **per-candidate** `whenToUse` / `whenNotToUse` / `distinguishFrom` from that candidate's catalog row — **do not** collapse sibling tool ids onto one shared paragraph.
2. For anti-patterns: rewrite to strip query-lexical bait; keep wording abstract (no domain tokens that match the query).
3. For siblings listed in `distinguishFrom`, append `vs <toolId>: <reason>` to **both** candidates' label text (or at least the declaring side + mirror).
4. Shared “family” blurbs are forbidden as the sole label body when two candidates share a family but differ by `distinguishFrom`.

These rules exist because shared alias enrichment caused real regressions on harvey-012 and harvey-008 (see eval log).

---

## 4. Hand overrides

- Allowed only via an explicit override file (e.g. `capability-ontology.overrides.json`) with `provenance.source = "hand-override"`.
- Every override is **logged** (WORM or append-only eval/ops log) with author, timestamp, reason, `overrideLogRef`.
- Overrides **must not** reference eval case IDs, suite ids, or held-out query text. CI grep fails the build if they do.
- Overrides that exist solely to improve a known eval case are contamination; reject in review.

---

## 5. Eval / pinned harness

1. Every Fast Decision held-out or smoke run **records `ontologyDigest`** in the summary JSON (same pinned-harness discipline as §7).
2. Results that omit the digest, or mix digests within a run, are invalid for citation.
3. Contaminated smokes (ontology or enrichment tuned on the eval set) must be tagged `contaminated-smoke` in the eval log and **must not** be quoted as held-out lift.
4. Fresh routing sets: author before ontology edits; freeze + hash; size well past one-flip swings; include sibling pairs and shell-bait on purpose.

---

## 6. Implementation order

1. Types + optional fields on `McpToolDefinition` / `SkillDefinition` (no behavior change).
2. Generator + digest; dual-read generated ontology in scorer with fixture fallback behind a flag.
3. Wire enrichment to **per-id** rows + `distinguishFrom` (fix sibling collapse).
4. Delete hand fixture; require digest in held-out summary.
5. Populate `whenToUse` / `whenNotToUse` / `distinguishFrom` on core ClawQL tools/skills **without** looking at frozen routing cases; then score the fresh set.

---

## 7. Non-goals (v0.1)

- Fine-tuning GLiNER weights.
- Temperature calibration (separate §7 calibration-split workstream).
- Two-stage classify (family then member) — optional later if `distinguishFrom` is insufficient.
- Changing ATR / capability-lifecycle allow rules.

---

## 8. Acceptance

- [ ] Existing plugins typecheck with no new required fields.
- [ ] Generated ontology digest is stable under canonicalization.
- [ ] Held-out summary includes `ontologyDigest`.
- [ ] CI fails hand overrides that mention eval case ids / held-out query snippets.
- [ ] Sibling pair smoke (not the contaminated Harvey seven) shows no shared-paragraph collapse for tools that declare `distinguishFrom`.
- [ ] Hand fixture retired from the default path.
