# ADR 0013: gdp-ts compile-time authorization proofs (layer 1)

- Status: Accepted
- Date: 2026-10-05
- Related: [`packages/clawql-gdp/`](../../packages/clawql-gdp/), [security defense-in-depth](../security/clawql-security-defense-in-depth.md), [`@gdp-ts/core`](https://github.com/rauchg/gdp-ts)

## Context

ClawQL’s nine-layer stack polices agents at runtime (Panguard / ATR, OpenAPPA, containment, redaction, Falco, WORM). Several catastrophic bugs are still _code-path_ failures: a new route or coding-agent edit that calls a sensitive function without performing the check. Examples already hit or narrowly avoided:

- `sources_approve` self-approve by the proposing agent
- Checkout accepting a client-supplied `supabaseUserId` without a verified session
- Mandate resume that binds args-hash but not the approver
- Event publish that could skip redact-before-JetStream

[gdp-ts](https://github.com/rauchg/gdp-ts) (Ghosts of Departed Proofs for TypeScript) makes sensitive functions demand a compile-time _proof_ about their exact named arguments. Mistakes do not compile; the ESLint preset stops forgeries (`as` proofs, minting outside `proofs/`).

## Decision

1. **Adopt gdp-ts as a layer-1 (build-time) control**, next to scan/sign/admit. It is not a product feature and not a replacement for Panguard (layer 4) or OpenAPPA (layer 5).
2. **Policy engines decide; proofs ensure the decision reaches the function.** Proof modules may call Panguard / OpenAPPA / session verify / two-party principal checks and return a `Proof`. Sensitive functions take that proof about named values.
3. **Ship `packages/clawql-gdp`**: re-exports `@gdp-ts/core`, branded ids, and `GdpService` (`name1`/`name2`/`name3` returning Effects). Domain trusted modules live under `**/proofs/**` in each package.
4. **Cover only catastrophic call sites** (ease-to-rigor slider):
   - Source approval (`ApproverMayApproveSource`)
   - Mandate execute / resume (`MandateArgsMatch` + operator decision)
   - Checkout session create (`VerifiedCheckoutSessionUser`)
   - Account deletion / offboard (`RecentSignIn`)
   - Memory erase (`EraseAuthorized`)
   - API key issuance (`IssuerAuthorized`)
   - JetStream / event stream publish (`PayloadRedacted`)
5. **Enable the gdp-ts ESLint preset as CI errors** on `packages/**/*.ts` and `src/**/*.ts` (required Lint job). Trusted modules: `**/proofs/**` (only place `defineProof` may run). Branded-id assertions: `**/ids.ts`. `no-proof-assertion` stays **error** everywhere — including tests — so `{} as Proof` fails CI. Non-strict mode (do not ban every `as` in the monorepo).
6. **Compile-fail regression tests.** Each sensitive package keeps `src/gdp-mistakes.ts` with `@ts-expect-error` for: no proof, wrong proof kind, proof about a different named value, and raw id. `npm run test:gdp-mistakes` (CI Lint job) holds the snapshots honest via `clawql-gdp/check-mistakes`.
7. **Mint proofs where the real check happens.** The redaction function returns `{ data, proof }`; the mandate verifier mints only after hash binding; approver proofs mint only after the two-party gate. No helper mints a proof without performing its check.
8. **Never store proofs.** Do not persist proofs in subscription records, pending files, queues, or caches. Proofs are request/handler-scoped ghosts. Anything long-lived keeps runtime rechecks (session revoke, ATR, args-hash revalidation). Stale proofs are a documented gdp-ts limit — storage would make them the default.

## Consequences

- New sensitive APIs must demand proofs; call sites use `name(...)` (or `GdpService.name*`) and mint proofs in trusted modules that perform the check.
- Agents writing platform code that skip a gate fail `tsc` / lint / `test:gdp-mistakes` before merge.
- Forged-proof and stale-proof limits remain documented; lint catches forgeries; runtime gates catch revocation; proofs are never durable state.
- Follow-on: keep #1202’s catalog removal of agent-held `sources_approve` — gdp-ts complements that human-gate work, it does not replace the catalog strip.
