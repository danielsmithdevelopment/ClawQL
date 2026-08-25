import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { WORMAuditTrail, makeWORMAuditTrailLayer } from "../trail.js";
import { createFailingRemoteBackend, createMemoryBackend } from "./memory.js";
import { openSqliteBackend } from "./sql-js.js";

const sample = {
  type: "SESSION_START" as const,
  timestamp: "2026-08-19T00:00:00.000Z",
  sessionId: "sess_sqlite",
  agentName: "test",
};

describe("openSqliteBackend", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persists entries across reopen", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-audit-"));
    const path = join(dir, "audit.db");

    const handle = await Effect.runPromise(openSqliteBackend(path));
    const layer = makeWORMAuditTrailLayer({
      local: handle.backend,
      remote: createMemoryBackend(),
      retry: { maxAttempts: 1, backoffMs: 1, backoffMultiplier: 1 },
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrail;
        yield* worm.append(sample);
      }).pipe(Effect.provide(layer))
    );
    await Effect.runPromise(handle.close());

    const handle2 = await Effect.runPromise(openSqliteBackend(path));
    const layer2 = makeWORMAuditTrailLayer({
      local: handle2.backend,
      remote: createMemoryBackend(),
      retry: { maxAttempts: 1, backoffMs: 1, backoffMultiplier: 1 },
    });
    const verified = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrail;
        return yield* worm.verify();
      }).pipe(Effect.provide(layer2))
    );
    await Effect.runPromise(handle2.close());
    expect(verified.ok).toBe(true);
    expect(verified.records).toBe(1);
  });

  it("writes outbox row when remote fails", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-audit-"));
    const path = join(dir, "audit.db");

    const handle = await Effect.runPromise(openSqliteBackend(path));
    const layer = makeWORMAuditTrailLayer({
      local: handle.backend,
      remote: createFailingRemoteBackend(),
      retry: { maxAttempts: 1, backoffMs: 1, backoffMultiplier: 1 },
    });
    const entry = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrail;
        return yield* worm.append(sample);
      }).pipe(Effect.provide(layer))
    );
    expect(entry.backendAcks).toEqual(["local", "remote_queued"]);

    const outbox = await Effect.runPromise(handle.backend.outboxList());
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.id).toBe(entry.id);
    await Effect.runPromise(handle.close());
  });

  const distCjs = fileURLToPath(new URL("../../dist/index.cjs", import.meta.url));

  it.skipIf(!existsSync(distCjs))(
    "CJS dist can open sqlite (sql.js wasm via import.meta shim)",
    async () => {
      dir = await mkdtemp(join(tmpdir(), "clawql-audit-cjs-"));
      const req = createRequire(import.meta.url);
      const cjs = req(distCjs) as { openSqliteBackend: typeof openSqliteBackend };
      const handle = await Effect.runPromise(cjs.openSqliteBackend(join(dir, "audit.db")));
      await Effect.runPromise(handle.close());
    }
  );
});
