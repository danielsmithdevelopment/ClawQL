#!/usr/bin/env npx tsx
/**
 * Evaluate a host-supplied celld lease snapshot via BurstWatchSources.
 *
 * Fail-closed: missing/invalid JSON invents nothing. Does not call AWS —
 * pair with `infra/aws-celld-burst/fetch-celld-leases-from-s3.sh` (or
 * `scripts/run-burst-watch-from-s3-leases.sh`).
 *
 * Usage:
 *   npx tsx scripts/burst-watch-from-celld-leases.mts ./celld-leases.json
 *   CLAWQL_CELLD_LEASE_SNAPSHOT=./leases.json npx tsx scripts/burst-watch-from-celld-leases.mts
 */
import { Effect, Layer } from "effect";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  BurstWatchStub,
  BurstWatchStubLive,
  BurstWatchSourcesUnavailableLive,
  BurstWatchSourcesService,
} from "../packages/clawql-k8s-operator/src/watches/index.ts";

const snapshotPath =
  process.argv[2]?.trim() || process.env.CLAWQL_CELLD_LEASE_SNAPSHOT?.trim() || "";

if (!snapshotPath) {
  console.error(
    "burst-watch-from-celld-leases: pass a lease snapshot path or set CLAWQL_CELLD_LEASE_SNAPSHOT"
  );
  process.exit(2);
}

const abs = resolve(snapshotPath);
const expectedRaw = process.env.CLAWQL_CELLD_EXPECTED_NODE_IDS?.trim();
const expectedNodeIds = expectedRaw
  ? expectedRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const sources = yield* BurstWatchSourcesService;
    const stub = yield* BurstWatchStub;
    const handle = yield* sources.start(stub, {
      enablePodInformer: false,
      enableNodeClaimInformer: false,
      celldLeaseSnapshotPath: abs,
      celldExpectedNodeIds: expectedNodeIds,
      celldFleetSourceNote: `operator glue: ${abs}`,
    });
    const queued = yield* stub.snapshotQueue();
    handle.stop();
    return { handle, queued };
  }).pipe(Effect.provide(Layer.mergeAll(BurstWatchSourcesUnavailableLive, BurstWatchStubLive)))
);

const fleet = result.handle.statuses.find((s) => s.id === "celld-fleet-health");
const out = {
  status: fleet?.started ? "ok" : "fail-closed",
  snapshotPath: abs,
  startedCount: result.handle.startedCount,
  statuses: result.handle.statuses,
  queuedEvictions: result.queued.filter((e) => e.kind === "pod_eviction_request").length,
  queued: result.queued,
  honesty:
    "Unavailable informers (no kubeconfig). Fleet health only from host lease snapshot — not invented.",
};

mkdirSync("artifacts", { recursive: true });
const outPath = "artifacts/burst-watch-from-celld-leases.json";
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}`);

if (!fleet?.started) {
  process.exit(2);
}
