import { Context, Effect, Layer } from "effect";
import type { BoundOperation } from "../types.js";

export type BoundExecuteResult = {
  readonly ok: boolean;
  readonly toolName: string;
  readonly sourceType: BoundOperation["sourceType"];
  readonly sourceRef: string;
  readonly result: unknown;
};

/**
 * Host-provided invoker for OpenAPI / GraphQL bindings.
 * `clawql-api` installs an ExecuteService-backed implementation at API boot.
 * Forms execute in-core via HTTP form submit when `formAction` is present.
 */
export class BoundOperationInvoker extends Context.Service<BoundOperationInvoker, {
    readonly invoke: (
      binding: BoundOperation,
      args: Readonly<Record<string, unknown>>
    ) => Effect.Effect<unknown, Error>;
  }>()("clawql/webmcp-draft/BoundOperationInvoker") {}

const notConfiguredImpl: Context.Service.Shape<typeof BoundOperationInvoker> = {
  invoke: (binding) =>
    Effect.fail(
      new Error(
        `BoundOperationInvoker not configured for ${binding.sourceType} ${binding.sourceRef} — enable clawql-webmcp-draft gateway and ExecuteService`
      )
    ),
};

/** Mutable host hook — `clawql-api` replaces this at createClawQLApi boot. */
let hostInvokerImpl: Context.Service.Shape<typeof BoundOperationInvoker> = notConfiguredImpl;

export const installBoundOperationInvoker = (
  impl: Context.Service.Shape<typeof BoundOperationInvoker>
): void => {
  hostInvokerImpl = impl;
};

export const resetBoundOperationInvokerForTests = (): void => {
  hostInvokerImpl = notConfiguredImpl;
};

export const BoundOperationInvokerNotConfiguredLive = Layer.succeed(
  BoundOperationInvoker,
  BoundOperationInvoker.of(notConfiguredImpl)
);

/** Live layer that delegates to the process-wide host invoker (set by clawql-api). */
export const BoundOperationInvokerHostLive = Layer.succeed(
  BoundOperationInvoker,
  BoundOperationInvoker.of({
    invoke: (binding, args) => hostInvokerImpl.invoke(binding, args),
  })
);

const submitForm = (
  binding: BoundOperation,
  args: Readonly<Record<string, unknown>>
): Effect.Effect<unknown, Error> => {
  const action = binding.formAction;
  if (!action) {
    return Effect.fail(
      new Error(
        `forms binding ${binding.toolName} has no formAction — re-draft from a snapshot that includes action`
      )
    );
  }
  const method = (binding.formMethod ?? "POST").toUpperCase();
  return Effect.tryPromise({
    try: async () => {
      // Defense in depth: refuse obvious private/loopback targets. Full egress
      // validation (DNS resolve, redirects) lives in clawql-api assertSafeSourceFetchUrl
      // and is applied by the HTTP bound-execute route before invoke (audit 2.03).
      let parsed: URL;
      try {
        parsed = new URL(action);
      } catch {
        throw new Error("bound execute target is not allowed");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("bound execute target is not allowed");
      }
      const host = parsed.hostname.toLowerCase();
      if (
        !host ||
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "metadata.google.internal" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.startsWith("10.") ||
        host.startsWith("192.168.") ||
        host.startsWith("169.254.")
      ) {
        throw new Error("bound execute target is not allowed");
      }
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v === undefined || v === null) continue;
        body.set(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      const init: RequestInit =
        method === "GET"
          ? { method: "GET", redirect: "manual" }
          : {
              method,
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body,
              redirect: "manual",
            };
      const url =
        method === "GET"
          ? `${parsed.href}${parsed.href.includes("?") ? "&" : "?"}${body.toString()}`
          : parsed.href;
      const res = await fetch(url, init);
      const text = await res.text();
      return {
        status: res.status,
        ok: res.ok,
        body: text.slice(0, 32_768),
      };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
};

/**
 * Execute a published binding: forms → HTTP submit; openapi/graphql → {@link BoundOperationInvoker}.
 */
export const executeBoundOperation = (
  binding: BoundOperation,
  args: Readonly<Record<string, unknown>>
): Effect.Effect<BoundExecuteResult, Error, BoundOperationInvoker> =>
  Effect.gen(function* () {
    const result =
      binding.sourceType === "forms"
        ? yield* submitForm(binding, args)
        : yield* Effect.flatMap(BoundOperationInvoker, (invoker) =>
            invoker.invoke(binding, args)
          );
    return {
      ok: true,
      toolName: binding.toolName,
      sourceType: binding.sourceType,
      sourceRef: binding.sourceRef,
      result,
    } satisfies BoundExecuteResult;
  });

/** Look up binding by tool name on a published version's bindings list. */
export const findBinding = (
  bindings: readonly BoundOperation[],
  toolName: string
): BoundOperation | undefined => bindings.find((b) => b.toolName === toolName);
