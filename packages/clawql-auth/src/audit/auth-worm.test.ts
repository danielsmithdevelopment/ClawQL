import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "./auth-events.js";
import { composeAuthEventSinks } from "./auth-events.js";
import { createAuthEventSinkFromEnv, resetAuthEventSinkCacheForTests } from "./auth-worm-sink.js";
import {
  AuthWormService,
  authWormLayerForTests,
  listAuthWormRecords,
  resetAuthWormStoreForTests,
  verifyAuthWormLog,
} from "./auth-worm.js";

describe("auth-worm", () => {
  it("hash-chains MCP_TOKEN_ISSUED events in memory mode", async () => {
    const env = {
      ...process.env,
      CLAWQL_AUTH_AUDIT_STORE: "memory",
    };
    await Effect.runPromise(resetAuthWormStoreForTests(env));
    resetAuthEventSinkCacheForTests();

    const sink = createAuthEventSinkFromEnv(env);
    const event: AuthEvent = {
      type: "MCP_TOKEN_ISSUED",
      clientId: "user-42",
      grantType: "id_jag",
      scope: ["execute", "search"],
      expiresAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      subjectId: "user-42",
      orgId: "acme",
      role: "operator",
      idpGroups: ["engineering", "guests"],
      matchedIdpGroups: ["engineering"],
    };
    await Effect.runPromise(sink(event));

    const records = await Effect.runPromise(listAuthWormRecords(10, env));
    expect(records).toHaveLength(1);
    expect(records[0]?.event).toMatchObject(event);

    const verified = await Effect.runPromise(verifyAuthWormLog(env));
    expect(verified.ok).toBe(true);
    expect(verified.records).toBe(1);
  });

  it("persists MCP_TOKEN_ISSUED to sqlite when configured", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawql-auth-audit-"));
    const env = {
      ...process.env,
      CLAWQL_HOME: dir,
      CLAWQL_AUTH_AUDIT_STORE: "sqlite",
    };
    await Effect.runPromise(resetAuthWormStoreForTests(env));
    resetAuthEventSinkCacheForTests();

    const sink = createAuthEventSinkFromEnv(env);
    await Effect.runPromise(
      sink({
        type: "MCP_TOKEN_ISSUED",
        clientId: "svc-1",
        grantType: "client_credentials",
        scope: ["execute"],
        expiresAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      })
    );

    const records = await Effect.runPromise(listAuthWormRecords(10, env));
    expect(records).toHaveLength(1);
    expect(records[0]?.event.type).toBe("MCP_TOKEN_ISSUED");
    expect((await Effect.runPromise(verifyAuthWormLog(env))).ok).toBe(true);
  });

  it("append via AuthWormService increments seq", async () => {
    const layer = authWormLayerForTests("memory");
    const records = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* AuthWormService;
        yield* worm.append({
          type: "MCP_TOKEN_VALIDATION_FAILED",
          reason: "bad_sig",
          timestamp: new Date().toISOString(),
        });
        yield* worm.append({
          type: "MCP_TOKEN_ISSUED",
          clientId: "c1",
          grantType: "id_jag",
          scope: ["execute"],
          expiresAt: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        });
        return yield* worm.list(10);
      }).pipe(Effect.provide(layer))
    );
    expect(records.map((r) => r.seq)).toEqual([1, 2]);
  });

  it("composeAuthEventSinks invokes all sinks", async () => {
    const seen: string[] = [];
    const sink = composeAuthEventSinks(
      () =>
        Effect.sync(() => {
          seen.push("a");
        }),
      () =>
        Effect.sync(() => {
          seen.push("b");
        })
    );
    await Effect.runPromise(
      sink({
        type: "MCP_TOKEN_ISSUED",
        clientId: "c1",
        grantType: "id_jag",
        scope: ["execute"],
        expiresAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      })
    );
    expect(seen).toEqual(["a", "b"]);
  });
});
