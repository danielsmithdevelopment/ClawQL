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
- Agents writing _platform_ code that skip a gate fail `tsc` / lint / `test:gdp-mistakes` before merge.
- Forged-proof and stale-proof limits remain documented; lint catches forgeries; runtime gates catch revocation; proofs are never durable state.
- Follow-on: keep #1202’s catalog removal of agent-held `sources_approve` — gdp-ts complements that human-gate work, it does not replace the catalog strip.

## Agent skills and the self-learning loop

gdp-ts changes the safety of agent-produced skills mostly **indirectly**. A proof must never be treated as runtime authority for code an agent wrote.

### What improves

1. **Platform gates are harder to bypass.** Skills and scripts from the self-learning loop eventually act through ClawQL runtime (`execute`, mandates, source proposals, event publish). Those paths refuse to _compile_ if a check is skipped. A bug in ClawQL’s own code can no longer quietly open a hole that agent-made skills slip through. This applies regardless of the skill’s language.
2. **Promotion gate for TypeScript skills (quality, not containment).** When agent scripts type-check against an SDK that demands proofs, a script that calls a mandated write without the mandate flow fails during “prove,” before promotion. Spec-derived risk maps cleanly: reads need no proof; writes require a mandate proof in the signature; blocked operations do not exist in the SDK. Record type-check and lint results as promotion evidence alongside held-out tests.

### The trap

Compile-time checks are **not** a security boundary against untrusted code. At runtime a proof is a frozen `{ kind }` object anyone can construct. Agent-written code is untrusted (prompt injection can shape it) and can evade types via `any`, casts, raw `fetch` past the SDK, or non-TypeScript scripts.

- **The gateway must never accept a proof object from a script.** Runtime authority stays with layer-3 controls: server-side scoped credentials and single-use mandates bound to exact arguments.
- **gdp-ts is a quality gate for agent code, not containment.** Containment remains the sandbox, layers 4–5 (Panguard / OpenAPPA), and runtime rechecks.

### Promotion rules (honest “trusted”)

Promotion means **reusable without re-approval each time**, not **runs unsandboxed**. A promoted skill still runs in the sandbox, still hits runtime gates, and can only do what it declared. Review then asks “is this scope acceptable?” rather than “is every line safe?”

1. Every skill declares a **capability manifest** (operations + risk, hosts, data labels, triggers/schedule, spend cap); the runtime denies undeclared actions.
2. **Automated evidence** before human review: gdp-ts type-check + **strict** lint for TypeScript (no `any`, no proof casts, no network except through the SDK, no `eval`); dependency and secret scans; Panguard scan of `SKILL.md`; sandboxed held-out runs with tracing and manifest conformance; adversarial tool-result injection; optional independent-model advisory summary.
3. **Human review sized to risk** — auto-promote clean read-only/internal; person for writes or new hosts; two reviewers for external writes or money. Non-TypeScript skills cannot get the gdp-ts gate → lower trust, stricter sandbox, no write promotion without a mandate.
4. **Verification continues after promotion** — behavioral drift demotes; any code change is a new proposal; OKF trust fields (`verified_by`, `stale_after`) force re-review.

**Product message:** ClawQL does not claim agent-written code is safe. It limits what that code can do, and shows exactly what it did.

## Follow-on: challenge-bound WebAuthn step-up

High-risk human gates (mandate approve, source approve, account delete, API key issue) should demand a `StepUpVerified<Principal, ActionHash>` (name TBD) minted only after a FIDO2/WebAuthn ceremony whose challenge is bound server-side to the canonical action hash. Binding checklist, UV flag, counter/AAGUID policy, and WORM evidence fields: [`docs/security/clawql-auth-oidc-stepup.md`](../security/clawql-auth-oidc-stepup.md#challenge-bound-step-up-binding-build). Standards-first (not YubiKey-only); TOTP must not satisfy these gates.
