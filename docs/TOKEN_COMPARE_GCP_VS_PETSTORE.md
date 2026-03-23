# Token comparison: GCP Cloud Run vs Petstore (third-party)

Methodology matches the README: **`~4 characters ≈ 1 token`**, same scripts as the
original GCP measurements.

## Phase 1 — Input: full generated OpenAPI vs `search` (top 5)

| | **GCP Cloud Run** (default discovery) | **Petstore** (`CLAWQL_SPEC_URL` demo) |
|---|-------------------------------------|----------------------------------------|
| Operations | 54 | 19 |
| Full spec (JSON) | ~265,185 chars → **~66,296 tok** | ~17,106 chars → **~4,277 tok** |
| Avg `search` top-5 payload* | **~1,746 tok** | **~509 tok** |
| **Input tokens saved vs full spec** | **~64,550** (~97%) | **~3,768** (~88%) |
| **Ratio (full ÷ search)** | **~38×** | **~8×** |

\*Three sample queries averaged: e.g. “list pets”, “get order by id”, “delete pet”
(Petstore) and earlier GCP samples (“list services…”, “IAM…”, etc.).

**Why Petstore’s ratio is smaller:** the OpenAPI file is **much smaller** (~17k vs
~265k chars), while each `search` hit still carries operation metadata, so the
**ratio** compresses even though you still avoid loading the **entire** spec into
context.

## Phase 2 — Output: schema “shape” vs minimal GraphQL selection

| | **GCP** (`GoogleCloudRunV2Service`) | **Petstore** (`Pet` component) |
|---|-------------------------------------|--------------------------------|
| Full JSON schema object (components.schemas) | **~2,671 tok** | **~134 tok** |
| Minimal field selection string (example) | **~20 tok** (list-services default) | **~4 tok** (`id` / `name` / `status`) |
| **Theoretical shape reduction** | **~2,651 tok saved** (~667× vs 4 tok floor)** | **~130 tok saved** (~33×)** |

\*\*Versus a tiny 4-token floor; ratios are most meaningful when schema objects are large (GCP).

Petstore’s **`Pet`** schema is small, so **absolute** output-token savings are
smaller than GCP’s huge Service object — **ratios** differ, but the mechanism is
the same: project only the fields you need.

### Live GraphQL proxy check (Petstore)

With `CLAWQL_SPEC_URL` + `CLAWQL_API_BASE_URL`, GraphQL was started (**Bun**;
older Node ESM issues with legacy dependencies may require Bun for some scripts).

Example query `pet(petId: 1)`:

- **Lean selection** `{ id name status }` → response **~60 bytes** (~**15 tok**).
- **Richer selection** (category, photoUrls, tags, …) → response **~116 bytes**
  (~**29 tok**).

So on **real wire JSON**, you still see a **~2×** response size reduction on this
toy example; larger resources widen the gap.

## Summary

| Phase | GCP (default) | Petstore (third-party) |
|------|----------------|-------------------------|
| **Input** | Very large spec → **very large** savings vs `search` | Smaller spec → **smaller absolute** savings, still **~88%** vs full spec in this run |
| **Output** | Huge resource schemas → **large** possible savings | Small `Pet` schema → **smaller absolute** savings; same GraphQL projection idea |

**Takeaway:** Token **multipliers** track spec size and object complexity. For a
**lean public API** (Petstore), numbers are smaller but directionally the same:
**two-tool + search** cuts planning input; **GraphQL projection** cuts execution
output when schemas are big or responses are wide.
