import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import type { Operation } from "../spec/operation-types.js";
import { mayFlow, PUBLIC_LABEL, labelForSpec, emptyIfcFlowConfig } from "./labels.js";
import {
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
  isReadOperation,
} from "./session-ifc-enforce.js";
import {
  SessionLabelStore,
  clearAllSessionLabelsSync,
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

  it("no-ops when flag off", () => {
    delete process.env.CLAWQL_ENABLE_SESSION_IFC;
    process.env.CLAWQL_SESSION_ID = "ifc-test-off";
    expect(
      accumulateSessionIfcReadSync({
        operation: readOp("github"),
        success: true,
      })
    ).toBeNull();
    expect(checkSessionIfcWriteSync({ operation: writeOp("slack") })).toBeNull();
  });
});
