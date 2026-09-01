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

  it("uses CLAWQL_ID_JAG_TEE_SIGN_CMD external signer", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "clawql-tee-cmd-"));
    const scriptPath = join(dir, "sign.mjs");
    await writeFile(
      scriptPath,
      `
      const chunks=[];
      process.stdin.on('data',c=>chunks.push(c));
      process.stdin.on('end',()=>{ process.stdout.write('hdr.payload.sig'); });
      `
    );
    const runtime = await Effect.runPromise(
      createIdJagIssuerFromEnv({
        secretStore: createMemorySecretStore(),
        eventSink: noopAuthEventSink,
        env: {
          CLAWQL_ID_JAG_ISSUER_ENABLED: "1",
          CLAWQL_ID_JAG_ISSUER_ORG_ID: "acme",
          CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM: pem,
          CLAWQL_ID_JAG_TEE_SIGN_CMD: `node ${scriptPath}`,
        },
      })
    );
    expect(runtime!.assertionSigner?.kind).toBe("tee");
    const jwt = await Effect.runPromise(
      runtime!.assertionSigner!.sign({
        claims: { sub: "u" },
        header: { alg: "RS256" },
      })
    );
    expect(jwt).toBe("hdr.payload.sig");
  });

  it("uses reference clawql-tee id-jag-sign-cmd binary", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const bin = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../clawql-tee/bin/id-jag-sign-cmd.mjs"
    );
    process.env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM = pem;
    const runtime = await Effect.runPromise(
      createIdJagIssuerFromEnv({
        secretStore: createMemorySecretStore(),
        eventSink: noopAuthEventSink,
        env: {
          CLAWQL_ID_JAG_ISSUER_ENABLED: "1",
          CLAWQL_ID_JAG_ISSUER_ORG_ID: "acme",
          CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM: pem,
          CLAWQL_ID_JAG_TEE_SIGN_CMD: `node ${bin}`,
        },
      })
    );
    expect(runtime!.assertionSigner?.kind).toBe("tee");
    const jwt = await Effect.runPromise(
      runtime!.assertionSigner!.sign({
        claims: { sub: "cmd-bin" },
        header: { alg: "RS256", kid: "ref" },
      })
    );
    expect(jwt.split(".")).toHaveLength(3);
    delete process.env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM;
  });
});
