import * as clawqlApi from "clawql-api";
import type { Operation } from "clawql-api";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureDocumentsPluginDeps, resetDocumentsPluginDepsForTests } from "../plugin/deps.js";
import { ONYX_SEND_SEARCH_OPERATION_ID } from "../plugin/knowledge-search-onyx.js";
import { executeKnowledgeSearchOnyxEffect } from "./knowledge-search-onyx-effect.js";

describe("executeKnowledgeSearchOnyxEffect", () => {
  beforeEach(() => {
    configureDocumentsPluginDeps({
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      }),
    });
  });

  afterEach(() => {
    resetDocumentsPluginDepsForTests();
    vi.restoreAllMocks();
  });

  it("rejects stream=true without calling execute", async () => {
    vi.spyOn(clawqlApi, "loadSpec").mockResolvedValue({
      operations: [{ id: `onyx::${ONYX_SEND_SEARCH_OPERATION_ID}` } as Operation],
      openapi: {
        openapi: "3.0.0",
        info: { title: "x", version: "1" },
        paths: {},
        components: { schemas: {} },
      },
      rawSource: {},
    });

    const execute = vi.fn();
    configureDocumentsPluginDeps({ execute });

    const out = await Effect.runPromise(
      executeKnowledgeSearchOnyxEffect({ query: "x", stream: true })
    );
    const body = JSON.parse(out.content[0]!.text) as { error: string };
    expect(body.error).toContain("stream");
    expect(execute).not.toHaveBeenCalled();
  });

  it("delegates to execute with search_query args", async () => {
    vi.spyOn(clawqlApi, "loadSpec").mockResolvedValue({
      operations: [{ id: `onyx::${ONYX_SEND_SEARCH_OPERATION_ID}` } as Operation],
      openapi: {
        openapi: "3.0.0",
        info: { title: "x", version: "1" },
        paths: {},
        components: { schemas: {} },
      },
      rawSource: {},
    });

    const execute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ hits: [] }) }],
    });
    configureDocumentsPluginDeps({ execute });

    const out = await Effect.runPromise(
      executeKnowledgeSearchOnyxEffect({ query: "pricing policy", num_hits: 5 })
    );
    expect(execute).toHaveBeenCalledWith({
      operationId: `onyx::${ONYX_SEND_SEARCH_OPERATION_ID}`,
      args: {
        search_query: "pricing policy",
        num_hits: 5,
        include_content: true,
        stream: false,
        run_query_expansion: false,
      },
      fields: undefined,
    });
    expect(JSON.parse(out.content[0]!.text)).toEqual({ hits: [] });
  });

  it("returns JSON error when Onyx operation is missing from the index", async () => {
    vi.spyOn(clawqlApi, "loadSpec").mockResolvedValue({
      operations: [{ id: "pets.list" } as Operation],
      openapi: {
        openapi: "3.0.0",
        info: { title: "x", version: "1" },
        paths: {},
        components: { schemas: {} },
      },
      rawSource: {},
    });

    const execute = vi.fn();
    configureDocumentsPluginDeps({ execute });

    const out = await Effect.runPromise(executeKnowledgeSearchOnyxEffect({ query: "hello" }));
    const body = JSON.parse(out.content[0]!.text) as { error: string };
    expect(body.error).toContain("Onyx search operation");
    expect(execute).not.toHaveBeenCalled();
  });
});
