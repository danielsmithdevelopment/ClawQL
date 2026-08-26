import { Effect } from "effect";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { noopAuthEventSink } from "../audit/auth-events.js";
import { createMemorySecretStore } from "../stores/memory.js";
import { createIdJagIssuerFromEnv } from "./id-jag-issuer-env.js";

describe("createIdJagIssuerFromEnv Layer C", () => {
  it("injects TEE-shaped assertionSigner when CLAWQL_ID_JAG_TEE_SIGNER=1", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const runtime = await Effect.runPromise(
      createIdJagIssuerFromEnv({
        secretStore: createMemorySecretStore(),
        eventSink: noopAuthEventSink,
        env: {
          CLAWQL_ID_JAG_ISSUER_ENABLED: "1",
          CLAWQL_ID_JAG_ISSUER_ORG_ID: "acme",
          CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM: pem,
          CLAWQL_ID_JAG_TEE_SIGNER: "1",
        },
      })
    );
    expect(runtime).not.toBeNull();
    expect(runtime!.assertionSigner?.kind).toBe("tee");
  });

  it("omits assertionSigner when TEE flag unset", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const runtime = await Effect.runPromise(
      createIdJagIssuerFromEnv({
        secretStore: createMemorySecretStore(),
        eventSink: noopAuthEventSink,
        env: {
          CLAWQL_ID_JAG_ISSUER_ENABLED: "1",
          CLAWQL_ID_JAG_ISSUER_ORG_ID: "acme",
          CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM: pem,
        },
      })
    );
    expect(runtime).not.toBeNull();
    expect(runtime!.assertionSigner).toBeUndefined();
  });
});
