import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import type { Operation } from "../spec/operation-types.js";
import {
  mayFlow,
  PUBLIC_LABEL,
  SOURCE_UNTRUSTED_LABEL,
  SESSION_IFC_MAX_FINE_SOURCE_LABELS,
  categoryLabelFor,
  emptyIfcFlowConfig,
  isUntrustedLabel,
  labelForSpec,
  mergeSessionLabelsBounded,
} from "./labels.js";
import {
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
  isReadOperation,
} from "./session-ifc-enforce.js";
import {
  SessionLabelStore,
  accumulateSessionLabelsSync,
  clearAllSessionLabelsSync,
  getSessionLabelsSync,
  makeSessionLabelStoreLayer,
  resolveSessionLabelKey,
} from "./session-label-store.js";

const readOp = (specLabel: string): Operation =>
  ({
    id: `${specLabel}.get`,
    method: "GET",
    path: "/x",
    flatPath: "/x",
    description: "read",
    resource: "x",
    parameters: {},
    specLabel,
  }) as Operation;

const writeOp = (specLabel: string): Operation =>
  ({
    id: `${specLabel}.create`,
    method: "POST",
    path: "/x",
    flatPath: "/x",
    description: "write",
    resource: "x",
    parameters: {},
    specLabel,
  }) as Operation;

afterEach(() => {
  clearAllSessionLabelsSync();
  delete process.env.CLAWQL_ENABLE_SESSION_IFC;
  delete process.env.CLAWQL_SESSION_ID;
  delete process.env.CLAWQL_SESSION_IFC_ALLOWED;
  delete process.env.CLAWQL_SESSION_IFC_MAX_FINE_LABELS;
});

describe("mergeSessionLabelsBounded (safe overflow)", () => {
  it("keeps fine labels under the cap", () => {
    const out = mergeSessionLabelsBounded(new Set(["source:a"]), ["source:b"], 32);
    expect([...out].sort()).toEqual(["source:a", "source:b"]);
  });

  it("collapses to categories then untrusted — never drops an early untrusted mark", () => {
    const existing = new Set<string>(["source:untrusted-email"]);
    const incoming = Array.from({ length: 40 }, (_, i) => `source:chan${i}`);
    const out = mergeSessionLabelsBounded(existing, incoming, SESSION_IFC_MAX_FINE_SOURCE_LABELS);
    expect(isUntrustedLabel([...out].find((l) => isUntrustedLabel(l)) ?? "")).toBe(true);
    expect(out.has(SOURCE_UNTRUSTED_LABEL)).toBe(true);
    // Must not be a FIFO drop of the first label leaving only later trusted sources.
    expect([...out].every((l) => l.startsWith("source:chan"))).toBe(false);
  });

  it("categoryLabelFor maps fine sources and untrusted shapes safely", () => {
    expect(categoryLabelFor("source:github-pr-99")).toBe("source:github");
    expect(categoryLabelFor("source:untrusted-email")).toBe(SOURCE_UNTRUSTED_LABEL);
    expect(categoryLabelFor("not-a-source")).toBe(SOURCE_UNTRUSTED_LABEL);
  });
});

describe("mayFlow (pure)", () => {
  it("allows empty fromUnion", () => {
    expect(mayFlow(new Set(), new Set(["source:slack"]))).toBe(true);
  });

  it("allows flow to public dest", () => {
    expect(mayFlow(new Set(["source:github"]), new Set([PUBLIC_LABEL]))).toBe(true);
  });

  it("allows same-source write by default", () => {
    expect(mayFlow(new Set(["source:github"]), new Set(["source:github"]))).toBe(true);
  });

  it("blocks higher label flowing to unrelated dest", () => {
    expect(mayFlow(new Set(["source:github"]), new Set(["source:slack"]))).toBe(false);
  });

  it("honors allowedSourcesByDest allow-list", () => {
    const config = emptyIfcFlowConfig();
    const allowed = new Map(config.allowedSourcesByDest);
    allowed.set("source:slack", new Set(["source:slack", "source:github"]));
    expect(
      mayFlow(new Set(["source:github"]), new Set(["source:slack"]), {
        ...config,
        allowedSourcesByDest: allowed,
      })
    ).toBe(true);
  });
});

describe("SessionLabelStore", () => {
  it("accumulates labels per session key", async () => {
    const map = new Map<string, Set<string>>();
    const layer = makeSessionLabelStoreLayer(map);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* SessionLabelStore;
        yield* store.accumulate("s1", ["source:a"]);
        yield* store.accumulate("s1", ["source:b"]);
        yield* store.accumulate("s2", ["source:c"]);
        const s1 = yield* store.get("s1");
        const s2 = yield* store.get("s2");
        return { s1: [...s1].sort(), s2: [...s2].sort() };
      }).pipe(Effect.provide(layer))
    );
    expect(result.s1).toEqual(["source:a", "source:b"]);
    expect(result.s2).toEqual(["source:c"]);
  });

  it("resolveSessionLabelKey prefers sessionId then env", () => {
    expect(resolveSessionLabelKey("mcp-1", {})).toBe("mcp-1");
    expect(resolveSessionLabelKey(undefined, { CLAWQL_SESSION_ID: "env-sess" })).toBe("env-sess");
    expect(resolveSessionLabelKey(undefined, { CLAWQL_API_KEY_ID: "kid" })).toBe("apikey:kid");
    expect(resolveSessionLabelKey(undefined, {})).toBe("default");
  });
});

describe("session IFC enforce", () => {
  it("isReadOperation classifies GET vs POST", () => {
    expect(isReadOperation(readOp("github"))).toBe(true);
    expect(isReadOperation(writeOp("slack"))).toBe(false);
  });

  it("accumulates on successful read when flag on; blocks later write to other sink", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "ifc-test-1";

    const afterRead = accumulateSessionIfcReadSync({
      operation: readOp("github-internal"),
      success: true,
    });
    expect(afterRead).toBeTruthy();
    expect([...afterRead!]).toContain(labelForSpec("github-internal"));

    const block = checkSessionIfcWriteSync({
      operation: writeOp("slack"),
    });
    expect(block).not.toBeNull();
    expect(block?.status).toBe("blocked");
    expect(block?.sessionLabels).toContain("source:github-internal");
    expect(block?.fix).toMatch(/destination/i);
  });

  it("allows write to same source after read", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "ifc-test-2";

    accumulateSessionIfcReadSync({
      operation: readOp("github"),
      success: true,
    });
    const block = checkSessionIfcWriteSync({
      operation: writeOp("github"),
    });
    expect(block).toBeNull();
  });

  it("no-ops when CLAWQL_ENABLE_SESSION_IFC=0", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "0";
    process.env.CLAWQL_SESSION_ID = "ifc-test-off";
    expect(
      accumulateSessionIfcReadSync({
        operation: readOp("github"),
        success: true,
      })
    ).toBeNull();
    expect(checkSessionIfcWriteSync({ operation: writeOp("slack") })).toBeNull();
  });

  it("defaults on when CLAWQL_ENABLE_SESSION_IFC is unset", () => {
    delete process.env.CLAWQL_ENABLE_SESSION_IFC;
    process.env.CLAWQL_SESSION_ID = "ifc-test-default-on";
    const afterRead = accumulateSessionIfcReadSync({
      operation: readOp("github-internal"),
      success: true,
    });
    expect(afterRead).toBeTruthy();
    const block = checkSessionIfcWriteSync({ operation: writeOp("slack") });
    expect(block).not.toBeNull();
  });

  it("safe label cap: untrusted read first among 40 sources still blocks unrelated write", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "ifc-cap-untrusted-first";
    // Default cap is 32; 40 fine-grained sources force safe merge.
    accumulateSessionIfcReadSync({
      operation: readOp("untrusted-email"),
      success: true,
    });
    for (let i = 0; i < 39; i++) {
      accumulateSessionIfcReadSync({
        operation: readOp(`doc${i}`),
        success: true,
      });
    }
    const labels = [...getSessionLabelsSync("ifc-cap-untrusted-first")];
    expect(labels.some((l) => isUntrustedLabel(l))).toBe(true);
    expect(labels).toContain(SOURCE_UNTRUSTED_LABEL);
    // Unrelated sink must still be blocked — overflow must not drop the poison mark.
    const block = checkSessionIfcWriteSync({ operation: writeOp("slack") });
    expect(block).not.toBeNull();
    expect(block?.sessionLabels.some((l) => isUntrustedLabel(l))).toBe(true);
  });

  it("safe label cap collapses unique sources without unbounded growth", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "ifc-cap-unique";
    process.env.CLAWQL_SESSION_IFC_MAX_FINE_LABELS = "8";
    for (let i = 0; i < 100; i++) {
      accumulateSessionLabelsSync("ifc-cap-unique", [`source:uniq${i}`]);
    }
    const labels = getSessionLabelsSync("ifc-cap-unique");
    expect(labels.size).toBeLessThanOrEqual(8);
    // 100 distinct categories → stage-2 merge to source:untrusted.
    expect(labels.has(SOURCE_UNTRUSTED_LABEL)).toBe(true);
  });

  /**
   * Utility cost of safe merge: a long session with only *trusted* fine-grained
   * reads can still lose precision when it crosses the cap. With an allow-list
   * that names those fine labels, a cross-sink write is allowed under the cap
   * and blocked after stage-2 merge to `source:untrusted`. Safety over utility.
   */
  it("safe label cap: long session past threshold treats later writes as risky", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "ifc-cap-utility-cost";
    const cap = SESSION_IFC_MAX_FINE_SOURCE_LABELS;
    const vendors = Array.from({ length: cap }, (_, i) => `prov${i}`);
    process.env.CLAWQL_SESSION_IFC_ALLOWED = JSON.stringify({
      allowedSourcesByDest: {
        "source:slack": vendors.map((v) => `source:${v}`),
      },
    });

    for (const v of vendors) {
      accumulateSessionIfcReadSync({ operation: readOp(v), success: true });
    }
    const underCap = getSessionLabelsSync("ifc-cap-utility-cost");
    expect(underCap.size).toBe(cap);
    expect(underCap.has(SOURCE_UNTRUSTED_LABEL)).toBe(false);
    // Same allow-listed write succeeds while fine labels are preserved.
    expect(checkSessionIfcWriteSync({ operation: writeOp("slack") })).toBeNull();

    // 33rd distinct source → stage-2 safe merge (categories > cap).
    accumulateSessionIfcReadSync({ operation: readOp(`prov${cap}`), success: true });
    const overCap = getSessionLabelsSync("ifc-cap-utility-cost");
    expect(overCap.has(SOURCE_UNTRUSTED_LABEL)).toBe(true);
    expect([...overCap].every((l) => l === SOURCE_UNTRUSTED_LABEL || l === PUBLIC_LABEL)).toBe(
      true
    );

    const block = checkSessionIfcWriteSync({ operation: writeOp("slack") });
    expect(block).not.toBeNull();
    expect(block?.status).toBe("blocked");
    expect(block?.sessionLabels).toContain(SOURCE_UNTRUSTED_LABEL);
  });
});
