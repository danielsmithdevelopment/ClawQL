import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  ObservabilityGovernanceSink,
  ObservabilityGovernanceSinkLive,
  ObservabilityLive,
  applyAlloyConfigEffect,
  defaultLokiProviderConfig,
  defaultMimirProviderConfig,
  defaultTempoProviderConfig,
  generateAlloyRiverEffect,
  registerBuiltinLgtmProvidersEffect,
  sanitizeRiverComponentName,
  snapshotRegistriesForAlloyEffect,
  validateAlloyRiverEffect,
} from "../index.js";
import type { ObservabilityGovernanceEvent } from "../governance/worm.js";

const goldenPath = fileURLToPath(
  new URL("./__fixtures__/lgtm-default.river.golden", import.meta.url)
);

describe("alloy sanitize", () => {
  it("normalises provider ids to River identifiers", () => {
    expect(sanitizeRiverComponentName("lgtm-loki")).toBe("lgtm_loki");
    expect(sanitizeRiverComponentName("Loki Replica!")).toBe("loki_replica");
  });
});

describe("alloy generate", () => {
  it("matches golden River for default LGTM+ providers", async () => {
    const generated = await Effect.runPromise(
      generateAlloyRiverEffect({
        logs: [
          {
            id: "lgtm-loki",
            signalType: "log",
            enabled: true,
            config: defaultLokiProviderConfig(),
          },
        ],
        metrics: [
          {
            id: "lgtm-mimir",
            signalType: "metric",
            enabled: true,
            config: defaultMimirProviderConfig(),
          },
        ],
        traces: [
          {
            id: "lgtm-tempo",
            signalType: "trace",
            enabled: true,
            config: defaultTempoProviderConfig(),
          },
        ],
      })
    );

    const golden = await readFile(goldenPath, "utf8");
    expect(generated.river).toBe(golden);
    expect(generated.exporterRefs.logs).toEqual(["otelcol.exporter.otlphttp.lgtm_loki.input"]);
  });

  it("fans out logs to multiple exporters in batch output", async () => {
    const generated = await Effect.runPromise(
      generateAlloyRiverEffect({
        logs: [
          {
            id: "lgtm-loki",
            signalType: "log",
            enabled: true,
            config: defaultLokiProviderConfig(),
          },
          {
            id: "loki-replica",
            signalType: "log",
            enabled: true,
            config: {
              endpoint: "http://loki-replica:3100",
              otlpEndpoint: "http://loki-replica:3100/otlp",
            },
          },
        ],
        metrics: [
          {
            id: "lgtm-mimir",
            signalType: "metric",
            enabled: true,
            config: defaultMimirProviderConfig(),
          },
        ],
        traces: [
          {
            id: "lgtm-tempo",
            signalType: "trace",
            enabled: true,
            config: defaultTempoProviderConfig(),
          },
        ],
        includeFaro: false,
      })
    );

    expect(generated.river).toContain("otelcol.exporter.otlphttp.lgtm_loki.input");
    expect(generated.river).toContain("otelcol.exporter.otlphttp.loki_replica.input");
    expect(generated.river).toMatch(
      /logs\s*=\s*\[\s*otelcol\.exporter\.otlphttp\.lgtm_loki\.input,\s*otelcol\.exporter\.otlphttp\.loki_replica\.input,/
    );
    expect(generated.river).not.toContain("faro.receiver");
  });

  it("validates generated River structurally", async () => {
    const generated = await Effect.runPromise(
      generateAlloyRiverEffect({
        logs: [
          {
            id: "lgtm-loki",
            signalType: "log",
            enabled: true,
            config: defaultLokiProviderConfig(),
          },
        ],
        metrics: [],
        traces: [],
        includeFaro: false,
      })
    );

    await Effect.runPromise(validateAlloyRiverEffect(generated.river));
  });
});

describe("alloy from registry + apply", () => {
  it("snapshots live registries and applies config with WORM", async () => {
    const events: ObservabilityGovernanceEvent[] = [];
    const sinkLayer = Layer.succeed(ObservabilityGovernanceSink, {
      append: (event: ObservabilityGovernanceEvent) =>
        Effect.sync(() => {
          events.push(event);
        }),
    });

    const dir = await mkdtemp(join(tmpdir(), "clawql-alloy-"));
    const outputPath = join(dir, "config.river");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* registerBuiltinLgtmProvidersEffect();
        const generation = yield* snapshotRegistriesForAlloyEffect();
        return yield* applyAlloyConfigEffect({
          session: { sub: "operator-1", scope: ["observability:configure"] },
          actorId: "operator-1",
          generation,
          outputPath,
        });
      }).pipe(Effect.provide(ObservabilityLive), Effect.provide(sinkLayer))
    );

    const written = await readFile(result.outputPath, "utf8");
    expect(written).toContain("otelcol.exporter.otlphttp");
    expect(written).toContain("prometheus.remote_write");
    expect(events.some((event) => event.type === "OBSERVABILITY_ALLOY_CONFIG_APPLIED")).toBe(true);
  });

  it("denies apply without configure scope", async () => {
    const exit = await Effect.runPromiseExit(
      applyAlloyConfigEffect({
        session: { sub: "reader", scope: ["observability:query_logs"] },
        actorId: "reader",
        generation: {
          logs: [
            {
              id: "lgtm-loki",
              signalType: "log",
              enabled: true,
              config: defaultLokiProviderConfig(),
            },
          ],
          metrics: [],
          traces: [],
          includeFaro: false,
        },
        outputPath: "/tmp/should-not-write.river",
      }).pipe(Effect.provide(ObservabilityGovernanceSinkLive))
    );

    expect(exit._tag).toBe("Failure");
  });
});
