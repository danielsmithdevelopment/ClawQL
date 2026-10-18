import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  appendBridgedMeshDenialEffect,
  resolveHostWormConfig,
} from "./worm-append.js";

describe("host worm append", () => {
  it("defers when URL unset", async () => {
    const out = await Effect.runPromise(
      appendBridgedMeshDenialEffect(
        {
          requestId: "r1",
          sourceIdentity: "spiffe://cell/a",
          destination: "audit-worm",
          layer: "waypoint",
          reason: "method not allowed",
        },
        null
      )
    );
    expect(out.bridged.wormType).toBe("MESH_POLICY_DENIED");
    expect(out.append.deferred).toBe(true);
    expect(out.append.ok).toBe(false);
  });

  it("resolves CLAWQL_AUDIT_WORM_URL", () => {
    expect(
      resolveHostWormConfig({ CLAWQL_AUDIT_WORM_URL: "http://127.0.0.1:9090/" })?.url
    ).toBe("http://127.0.0.1:9090");
  });

  it("POSTs bridged denial to /entries", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: u, body });
      return new Response(
        JSON.stringify({ ok: true, hash: "abc", chainIndex: 1 }),
        { status: 200 }
      );
    };
    const out = await Effect.runPromise(
      appendBridgedMeshDenialEffect(
        {
          requestId: "r2",
          sourceIdentity: "spiffe://cell/b",
          destination: "payments",
          layer: "ztunnel",
          reason: "denied",
          sessionId: "sess-burst-1",
        },
        { url: "http://worm.test", apiKey: "k" },
        fetchImpl as unknown as typeof fetch
      )
    );
    expect(out.append.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://worm.test/entries");
    expect((calls[0]!.body as { type: string }).type).toBe("MESH_POLICY_DENIED");
    expect((calls[0]!.body as { sessionId: string }).sessionId).toBe("sess-burst-1");
  });
});
