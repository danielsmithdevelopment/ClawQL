import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { renderSpanFlamegraphHtmlEffect } from "./span-flame-html.js";
import {
  buildSpanFlamegraphEffect,
  demoSpanFlameFixtureEffect,
  parseTempoTracePayloadEffect,
  type FlatSpan,
} from "./span-flame.js";

describe("span flamegraph model", () => {
  it("builds self-time tree from nested spans", async () => {
    const t0 = 1_000;
    const spans: FlatSpan[] = [
      {
        spanId: "a",
        parentSpanId: null,
        name: "root",
        serviceName: "svc-a",
        startMs: t0,
        endMs: t0 + 100,
        status: "ok",
      },
      {
        spanId: "b",
        parentSpanId: "a",
        name: "child",
        serviceName: "svc-b",
        startMs: t0 + 10,
        endMs: t0 + 60,
        status: "ok",
      },
    ];
    const graph = await Effect.runPromise(buildSpanFlamegraphEffect("t1", spans));
    expect(graph.spanCount).toBe(2);
    expect(graph.totalDurationMs).toBe(100);
    expect(graph.roots).toHaveLength(1);
    expect(graph.roots[0]?.selfMs).toBe(50);
    expect(graph.roots[0]?.children[0]?.selfMs).toBe(50);
    expect(graph.mostSelfTime[0]?.selfMs).toBeGreaterThanOrEqual(50);
    expect(graph.services.map((s) => s.name).sort()).toEqual(["svc-a", "svc-b"]);
  });

  it("parses Jaeger Tempo payload", async () => {
    const payload = {
      data: [
        {
          traceID: "abc",
          processes: { p1: { serviceName: "clawql-mcp" } },
          spans: [
            {
              spanID: "s1",
              operationName: "http.server",
              processID: "p1",
              startTime: 1_700_000_000_000_000,
              duration: 50_000,
              references: [],
            },
            {
              spanID: "s2",
              operationName: "mcp.tool",
              processID: "p1",
              startTime: 1_700_000_000_010_000,
              duration: 30_000,
              references: [{ refType: "CHILD_OF", spanID: "s1" }],
            },
          ],
        },
      ],
    };
    const parsed = await Effect.runPromise(parseTempoTracePayloadEffect(payload));
    expect(parsed.traceId).toBe("abc");
    expect(parsed.spans).toHaveLength(2);
    expect(parsed.spans[1]?.parentSpanId).toBe("s1");
    const graph = await Effect.runPromise(
      buildSpanFlamegraphEffect(parsed.traceId, parsed.spans)
    );
    expect(graph.totalDurationMs).toBeGreaterThan(0);
  });

  it("parses OTLP resourceSpans payload", async () => {
    const payload = {
      batches: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "clawql-mcp" } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "otlp-1",
                  spanId: "root",
                  name: "POST /mcp",
                  startTimeUnixNano: "1700000000000000000",
                  endTimeUnixNano: "1700000000120000000",
                  status: { code: 1 },
                },
                {
                  traceId: "otlp-1",
                  spanId: "child",
                  parentSpanId: "root",
                  name: "execute",
                  startTimeUnixNano: "1700000000010000000",
                  endTimeUnixNano: "1700000000100000000",
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const parsed = await Effect.runPromise(parseTempoTracePayloadEffect(payload));
    expect(parsed.traceId).toBe("otlp-1");
    expect(parsed.spans[0]?.serviceName).toBe("clawql-mcp");
    const graph = await Effect.runPromise(
      buildSpanFlamegraphEffect(parsed.traceId, parsed.spans)
    );
    expect(graph.spanCount).toBe(2);
  });

  it("renders demo HTML with honesty banner", async () => {
    const graph = await Effect.runPromise(demoSpanFlameFixtureEffect());
    const html = await Effect.runPromise(renderSpanFlamegraphHtmlEffect(graph));
    expect(html).toContain("Trace flamegraph");
    expect(html).toContain("demo-mcp-execute");
    expect(html).toContain("mcp.tool.call execute");
    expect(html).toContain("Most self time");
    expect(html).toContain("Not a Pyroscope CPU profile");
  });
});
