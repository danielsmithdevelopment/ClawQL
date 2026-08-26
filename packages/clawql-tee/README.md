# clawql-tee

TEE-shaped signing bridge for ClawQL ID-JAG issuer (Layer C).

## API

- **`createTeeIdJagSignerBridge`** — wraps host `sign` Effect as `IdJagAssertionSigner` for `clawql-auth` issuer deps
- **`createDevTeeIdJagSigner`** — local/dev stub (`attestationId: "dev-stub"`)

```ts
import { createDevTeeIdJagSigner } from "clawql-tee";
import { createLocalIdJagAssertionSigner } from "clawql-auth";

const local = createLocalIdJagAssertionSigner(signing);
const tee = createDevTeeIdJagSigner((req) => local.sign(req));
// pass tee as assertionSigner to createIdJagIssuerService / createIdJagIssuerFromEnv
```

Env:

- `CLAWQL_ID_JAG_TEE_SIGNER=1` — issuer env bootstrap wraps local jose as TEE-shaped (`kind: "tee"`) without importing this package
- `CLAWQL_TEE_DEBUG=1` — log attestation ids on sign when using this bridge
