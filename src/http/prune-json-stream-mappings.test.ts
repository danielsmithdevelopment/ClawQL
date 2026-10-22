import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  pruneOrphanJsonStreamMappingsEffect,
  type WebStandardStreamMaps,
} from "./prune-json-stream-mappings.js";

function makeWeb(partial: Partial<WebStandardStreamMaps> = {}): WebStandardStreamMaps {
  return {
    _enableJsonResponse: true,
    _standaloneSseStreamId: "_GET_stream",
    _streamMapping: new Map(),
    _requestToStreamMapping: new Map(),
    ...partial,
  };
}

describe("pruneOrphanJsonStreamMappingsEffect", () => {
  it("removes completed JSON-mode stream entries not referenced by request maps", () => {
    const web = makeWeb();
    let cleaned = 0;
    web._streamMapping!.set("done-1", {
      resolveJson: () => undefined,
      cleanup: () => {
        cleaned += 1;
        web._streamMapping!.delete("done-1");
      },
    });
    web._streamMapping!.set("done-2", {
      resolveJson: () => undefined,
      cleanup: () => {
        cleaned += 1;
        web._streamMapping!.delete("done-2");
      },
    });

    const pruned = Effect.runSync(pruneOrphanJsonStreamMappingsEffect(web));
    expect(pruned).toBe(2);
    expect(cleaned).toBe(2);
    expect(web._streamMapping!.size).toBe(0);
  });

  it("keeps in-flight streams still listed in _requestToStreamMapping", () => {
    const web = makeWeb();
    web._streamMapping!.set("inflight", {
      resolveJson: () => undefined,
      cleanup: () => {
        web._streamMapping!.delete("inflight");
      },
    });
    web._streamMapping!.set("done", {
      resolveJson: () => undefined,
      cleanup: () => {
        web._streamMapping!.delete("done");
      },
    });
    web._requestToStreamMapping!.set("req-1", "inflight");

    const pruned = Effect.runSync(pruneOrphanJsonStreamMappingsEffect(web));
    expect(pruned).toBe(1);
    expect(web._streamMapping!.has("inflight")).toBe(true);
    expect(web._streamMapping!.has("done")).toBe(false);
  });

  it("preserves standalone SSE stream and skips when JSON mode is off", () => {
    const web = makeWeb({ _enableJsonResponse: false });
    web._streamMapping!.set("_GET_stream", {
      controller: {},
      cleanup: () => undefined,
    });
    web._streamMapping!.set("orphan", {
      resolveJson: () => undefined,
      cleanup: () => {
        web._streamMapping!.delete("orphan");
      },
    });
    expect(Effect.runSync(pruneOrphanJsonStreamMappingsEffect(web))).toBe(0);
    expect(web._streamMapping!.size).toBe(2);

    web._enableJsonResponse = true;
    web._streamMapping!.set("_GET_stream", {
      controller: {},
      cleanup: () => undefined,
    });
    const pruned = Effect.runSync(pruneOrphanJsonStreamMappingsEffect(web));
    expect(pruned).toBe(1);
    expect(web._streamMapping!.has("_GET_stream")).toBe(true);
  });
});
