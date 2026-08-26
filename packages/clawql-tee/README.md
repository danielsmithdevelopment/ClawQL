# clawql-tee

TEE-shaped signing bridge for ClawQL ID-JAG issuer (Layer C) and future hardware attestation adapters.

## API

### Bridge (legacy / host inject)

- **`createTeeIdJagSignerBridge`** — wraps host `sign` Effect as `IdJagAssertionSigner`
- **`createDevTeeIdJagSigner`** — dev stub (`attestationId: "dev-stub"`)

### Platform adapters

- **`createSimulatedPlatformAdapter`** — software attestation report (not hardware-backed)
- **`createHardwarePlatformAdapter`** — placeholder for `sev-snp` / `tdx` / `nitro` (fail closed until wired)
- **`resolveTeePlatformFromEnv`** — reads `CLAWQL_TEE_PLATFORM` (default `simulated`)
- **`createIdJagSignerFromPlatform`** / **`createSimulatedIdJagSigner`** — ID-JAG signer with attestation gate

```ts
import { createSimulatedIdJagSigner } from "clawql-tee";
import { loadMcpOAuthSigningMaterialEffect } from "clawql-auth";
import { Effect } from "effect";

const signing = await Effect.runPromise(loadMcpOAuthSigningMaterialEffect({ /* … */ }));
const assertionSigner = await Effect.runPromise(createSimulatedIdJagSigner(signing));
// inject as assertionSigner in createIdJagIssuerFromEnv options
```

## External cmd signer

Reference binary for `CLAWQL_ID_JAG_TEE_SIGN_CMD`:

```bash
CLAWQL_ID_JAG_TEE_SIGN_CMD="node $(npm root)/clawql-tee/bin/id-jag-sign-cmd.mjs"
```

Contract: stdin JSON `{ claims, header }` → stdout compact JWS. Key from `CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM` or `_PATH`.

## Env

| Variable | Role |
| -------- | ---- |
| `CLAWQL_ID_JAG_TEE_SIGNER=1` | In `clawql-auth` issuer env: wrap local jose as `kind: "tee"` (no attestation) |
| `CLAWQL_ID_JAG_TEE_SIGN_CMD` | Shell out to external signer (see bin above) |
| `CLAWQL_TEE_PLATFORM` | `simulated` (default), `sev-snp`, `tdx`, `nitro` |
| `CLAWQL_TEE_STRICT=1` | Reject simulated attestation on ID-JAG sign |
| `CLAWQL_TEE_DEBUG=1` | Log attestation / platform on sign |
| `CLAWQL_WORM_TEE=1` | In `clawql-audit`: ECDSA P-256 `teeSignature` on WORM append (see clawql-audit README) |

Hardware platforms fail closed until cloud TEE integration lands.
