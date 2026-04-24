import { describe, expect, it, vi } from "vitest";
import * as specLoader from "./spec-loader.js";
import type { OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./spec-loader.js";
import {
  ONYX_SEND_SEARCH_OPERATION_ID,
  handleKnowledgeSearchOnyxToolInput,
  resolveOnyxSendSearchOperationId,
} from "./knowledge-search-onyx.js";
import * as tools from "./tools.js";

describe("resolveOnyxSendSearchOperationId", () => {
  it("prefers merged onyx:: id", () => {
    expect(
      resolveOnyxSendSearchOperationId([
        { id: "github::repos/list" },
        { id: `onyx::${ONYX_SEND_SEARCH_OPERATION_ID}` },
      ])
    ).toBe(`onyx::${ONYX_SEND_SEARCH_OPERATION_ID}`);
  });

  it("falls back to single-spec id", () => {
    expect(resolveOnyxSendSearchOperationId([{ id: ONYX_SEND_SEARCH_OPERATION_ID }])).toBe(
      ONYX_SEND_SEARCH_OPERATION_ID
    );
  });

  it("returns undefined when missing", () => {
    expect(resolveOnyxSendSearchOperationId([{ id: "other" }])).toBeUndefined();
  });
});

describe("handleKnowledgeSearchOnyxToolInput", () => {
  it("returns JSON error when Onyx operation is not in the loaded index", async () => {
    vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
      operations: [{ id: "pets.list" } as Operation],
      openapi: {
        openapi: "3.0.0",
        info: { title: "x", version: "1" },
        paths: {},
        components: { schemas: {} },
      },
      rawSource: {},
    });

    const out = await handleKnowledgeSearchOnyxToolInput({ query: "hello" });
    const body = JSON.parse(out.content[0].text) as { error: string };
    expect(body.error).toContain("Onyx search operation");
  });

  it("delegates to execute with merged operation id", async () => {
    const openapi: OpenAPIDoc = {
      openapi: "3.0.3",
      info: { title: "Onyx", version: "1" },
      servers: [{ url: "http://127.0.0.1:9" }],
      paths: {},
      components: { schemas: {} },
    };

    vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
      operations: [
        {
          id: `onyx::${ONYX_SEND_SEARCH_OPERATION_ID}`,
          method: "POST",
          path: "search/send-search-message",
          flatPath: "search/send-search-message",
          description: "search",
          resource: "search",
          parameters: {},
          specIndex: 0,
          specLabel: "onyx",
          requestBody: "__clawql_inline_request_body__",
          requestBodyContentType: "application/json",
        } as Operation,
      ],
      openapi,
      openapis: [openapi],
      multi: true,
      rawSource: {},
    });

    const spy = vi.spyOn(tools, "handleClawqlExecuteToolInput").mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    });

    const out = await handleKnowledgeSearchOnyxToolInput({
      query: "pricing policy",
      num_hits: 5,
    });
    expect(spy).toHaveBeenCalledWith({
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
    expect(JSON.parse(out.content[0].text)).toEqual({ ok: true });
    spy.mockRestore();
  });

  it("rejects stream=true", async () => {
    vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
      operations: [{ id: `onyx::${ONYX_SEND_SEARCH_OPERATION_ID}` } as Operation],
      openapi: {
        openapi: "3.0.0",
        info: { title: "x", version: "1" },
        paths: {},
        components: { schemas: {} },
      },
      rawSource: {},
    });

    const out = await handleKnowledgeSearchOnyxToolInput({
      query: "x",
      stream: true,
    });
    const body = JSON.parse(out.content[0].text) as { error: string };
    expect(body.error).toContain("stream");
  });
});
