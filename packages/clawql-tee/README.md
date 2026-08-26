# clawql-tee

Optional Layer C bridge for attestation-gated ID-JAG signing.

- **`createTeeIdJagSignerBridge`** — wraps host `sign` Effect as `IdJagAssertionSigner` for `clawql-auth` issuer deps
- **`createDevTeeIdJagSigner`** — local stub with `attestationId: dev-stub`

Inject on the issuer:

```typescript
import { createDevTeeIdJagSigner } from "clawql-tee";
import { createLocalIdJagAssertionSigner, issueIdJagAssertionEffect } from "clawql-auth";

const local = createLocalIdJagAssertionSigner(signing);
const signer = createDevTeeIdJagSigner((req) => local.sign(req));
```

Set `CLAWQL_TEE_DEBUG=1` to log attestation ids on sign.
