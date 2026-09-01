import { Effect } from "effect";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BoundOperationInvokerHostLive,
  DraftStoreDurableLive,
  DraftStoreService,
  executeBoundOperation,
  installBoundOperationInvoker,
  resetBoundOperationInvokerForTests,
  resetDefaultDraftStoreForTests,
  type BoundOperation,
} from "./index.js";

describe("webmcp-draft bound execute", () => {
  afterEach(() => {
    resetBoundOperationInvokerForTests();
    resetDefaultDraftStoreForTests();
  });

  it("submits forms via formAction without host invoker", async () => {
    const binding: BoundOperation = {
      toolName: "form_upload",
      sourceType: "forms",
      sourceRef: "form#upload",
      formAction: "https://example.test/upload",
      formMethod: "POST",
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("ok", { status: 200 })) as typeof fetch;
    try {
      const out = await Effect.runPromise(
        executeBoundOperation(binding, { caption: "hi" }).pipe(
          Effect.provide(BoundOperationInvokerHostLive)
        )
      );
      expect(out.ok).toBe(true);
      expect(out.toolName).toBe("form_upload");
      expect((out.result as { status: number }).status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("delegates openapi bindings to installed host invoker", async () => {
    installBoundOperationInvoker({
      invoke: (binding, args) =>
        Effect.succeed({
          echoed: binding.sourceRef,
          args,
        }),
    });
    const binding: BoundOperation = {
      toolName: "add_to_cart",
      sourceType: "openapi",
      sourceRef: "addToCart",
    };
    const out = await Effect.runPromise(
      executeBoundOperation(binding, { productId: "p1" }).pipe(
        Effect.provide(BoundOperationInvokerHostLive)
      )
    );
    expect(out.result).toEqual({ echoed: "addToCart", args: { productId: "p1" } });
  });
});

describe("webmcp-draft durable store", () => {
  afterEach(() => {
    delete process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH;
    delete process.env.CLAWQL_WEBMCP_DRAFT_DURABLE;
    resetDefaultDraftStoreForTests();
  });

  it("persists candidates to JSON across DurableLive remounts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webmcp-draft-"));
    const file = join(dir, "store.json");
    process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH = file;
    process.env.CLAWQL_WEBMCP_DRAFT_DURABLE = "1";
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* DraftStoreService;
          expect(store.durability).toBe("durable");
          yield* store.putCandidates([
            {
              candidateId: "cand_test_1",
              sourceType: "openapi",
              sourceRef: "addToCart",
              proposedTool: {
                name: "add_to_cart",
                description: "Add to cart",
                inputSchema: { type: "object" },
              },
              confidence: "high",
              inferenceNotes: "test",
            },
          ]);
        }).pipe(Effect.provide(DraftStoreDurableLive))
      );
      const raw = readFileSync(file, "utf8");
      expect(raw).toContain("cand_test_1");
      resetDefaultDraftStoreForTests();
      await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* DraftStoreService;
          const listed = yield* store.listCandidates();
          expect(listed.map((c) => c.candidateId)).toContain("cand_test_1");
        }).pipe(Effect.provide(DraftStoreDurableLive))
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
