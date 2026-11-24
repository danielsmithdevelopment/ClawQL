# Pass 9 — `apps/docs` + `apps/docs-astro` (2026-11-24)

Companion to the rolling audit in [`codebase-section-audit-2026-11-24.md`](./codebase-section-audit-2026-11-24.md) (Pass 0–1 + Pass 9 docs section) and the www slice [`codebase-section-audit-pass-9-www-2026-11-24.md`](./codebase-section-audit-pass-9-www-2026-11-24.md).

## Verdict

**Production winner:** `apps/docs` (Next/OpenNext → `deploy-docs.yml` → `docs.clawql.com`).  
**Cutover winner:** `apps/docs-astro` (ADR 0018; not deployed).  
**Canonical prose winner:** repo `docs/` → sync scripts → generated → Astro import.

#1508 scrubbed many streams/mdx/Astro copies and Ontologiql from both docs apps, but **committed `apps/docs/src/generated/*` was not regenerated**, and `prebuild` builds `agent-markdown.json` **before** sync — so AgentMarkdownDocBody routes can still ship Pass 0 claim residuals.

## Findings (9.01–9.14)

| ID   | Severity         | Location                                                                                | Problem                                                                          | Change                                                        | Effort |
| ---- | ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| 9.01 | Fix now          | `apps/docs/package.json` `prebuild` order                                               | `generate-agent-markdown` runs before sync                                       | Sync first, then generate                                     | S      |
| 9.02 | Fix now          | `apps/docs/src/generated/clawql-streams-body.mdx` 29, 440                               | Still **RPO=0**; `docs/streams` + mdx + Astro already disk-quorum                | Regenerate after 9.01                                         | S      |
| 9.03 | Fix now          | `…/clawql-plugin-registry-body.mdx` 44 vs `docs/reference/clawql-plugin-registry.md` 49 | Generated still **FedRAMP-ready**                                                | Re-sync plugin docs                                           | S      |
| 9.04 | Fix now          | `docs/vision/clawql-idp-platform.md` (+ generated/mdx/Astro mirrors)                    | Public GTM link, executor.sh jabs, FedRAMP certifications row                    | Edit canonical source; re-sync                                | M      |
| 9.05 | Fix now          | vision roadmap (source + generated + mdx + Astro)                                       | "full WORM defaults remain roadmap" vs WORM default-on in `clawql-audit`         | Align copy with default-on                                    | S      |
| 9.06 | Before regulated | `ClawqlAnalyticsPageview.tsx` + `/api/analytics/pageview`                               | Consent flag never set by UI; API requires sessionId; `anonymous_no_id` residual | Consent UX + align client/API                                 | M      |
| 9.07 | Before regulated | auth / mcp-clients / panguard learn (+ Astro)                                           | Public **"IdP"** vs document IDP                                                 | Spell "identity provider"                                     | S      |
| 9.08 | Before regulated | security curriculum module 28 (all copies)                                              | RPO=0 tier target readable as shipping guarantee                                 | Label as target; point at disk quorum                         | S      |
| 9.09 | Cleanup          | dual docs apps                                                                          | Two trees; Astro import can undo hand fixes                                      | Astro after cutover; edit docs/ only until then               | L      |
| 9.10 | Cleanup          | committed generated + parallel `src/mdx`                                                | Dead/divergent mirrors                                                           | Gitignore generated or sync-ordered commit; delete unused mdx | M      |
| 9.11 | Cleanup          | case studies ×3                                                                         | Manual "edit both"; diverging line counts                                        | `docs/case_studies` wins + sync                               | M      |
| 9.12 | Cleanup          | security curriculum ×5+                                                                 | series / curriculum-v30 / archive / generated / mdx / Astro                      | series wins                                                   | M      |
| 9.13 | Cleanup          | docs-astro undeployed                                                                   | No CI/Pages workflow                                                             | Preview workflow when ready                                   | M      |
| 9.14 | Improve          | executor-comparison benchmark page                                                      | OK as equal-arm evidence; keep jabs out of vision copy                           | Keep page; strip jab elsewhere                                | S      |

## Consolidation (what merges into what)

1. **Site:** `apps/docs-astro` replaces `apps/docs` after DNS cutover (ADR 0018).
2. **Prose:** `docs/**` wins; generated is build output; Astro only via import.
3. **Case studies:** `docs/case_studies` → sync into docs app → Astro import.
4. **Security curriculum:** `docs/security/security-best-practices-series` wins; archive read-only; drop curriculum-v30 + unused mdx.
5. **GTM:** www stubs stay; remove docs/vision front-door links to `/idp/gtm`.
