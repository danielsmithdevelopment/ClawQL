# Fast Decision v0.7 — catalog freeze then calibrate

**Status:** path only. **`calibrated: true` / `routingCatalogAlignedForProductionTrust()` must not pass by assertion.** v0.6 is spent.

## Sequence (do not skip)

1. **Finish catalog changes first.** Later catalog edits invalidate the freeze.
   - [x] Remove MCP `sources_approve` from the agent catalog (two-party: propose ≠ approve).
   - [x] Remove Supabase MCP tools (`supabase_verify_session`, `supabase_checkout_handoff`) from the agent catalog.
   - [x] Keep `memory_sync` on default-on memory: Cloud Agent vault reconcile, not a human gate.
   - [ ] Land remaining identity/checkout hardening that does **not** add agent tools ([#1201](https://github.com/danielsmithdevelopment/ClawQL/pull/1201)) before freeze if it still touches registration.
2. **Freeze the catalog digest** of the live default-on Core MCP tool names + bodies (no `pageindex_*`, no operator-only tools).
3. **Build a fresh v0.7 routing set** against that frozen catalog only.
4. **Fit calibration on a separate set**, score once on the frozen v0.7 set, frontier-model adjudicate.
5. **Then** `routingCatalogAlignedForProductionTrust()` may return true **on that evidence**.

Until step 5, production trust stays fail-closed (`calibrated: false`).
