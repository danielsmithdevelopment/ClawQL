# clawql-gdp

Effect-first wrappers around [`@gdp-ts/core`](https://github.com/rauchg/gdp-ts) (Ghosts of Departed Proofs) for ClawQL.

## Role in the security stack

gdp-ts is a **layer-1 / build-time** control. It does not replace Panguard (layer 4) or OpenAPPA (layer 5). Those engines _decide_; gdp-ts ensures the decision _reaches_ sensitive ClawQL functions about the exact named values. See [ADR 0013](../../docs/adr/0013-gdp-ts-compile-time-auth-proofs.md).

## Usage with Effect

`name()` is callback-scoped. Return an `Effect` from the callback and `yield*` it:

```ts
import { name } from "clawql-gdp";
import { Effect } from "effect";

return name(approverId, proposalId, (approver, proposal) =>
  Effect.gen(function* () {
    const proof = yield* approverMayApproveSourceEffect(approver, proposal, ctx);
    if (!proof) return yield* Effect.fail(new Error("forbidden"));
    return yield* commitSourceApprovalEffect(proposal, proof);
  })
);
```

Trusted proof modules live under `**/proofs/**` in each domain package. The ESLint gdp-ts preset bans `defineProof` and proof forgeries outside those directories.
