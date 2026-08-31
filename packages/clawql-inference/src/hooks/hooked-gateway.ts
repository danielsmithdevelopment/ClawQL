/**
 * InferenceGateway decorator — fires model-scope lifecycle hooks (pre-model / post-model).
 */

import {
  atrScopeFromTokens,
  fireHooksForEvent,
  WormAuditSink,
  type HookRegistry,
  type HookResult,
} from "clawql-core";
import type { Context } from "effect";
import { Effect } from "effect";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";

export type HookedInferenceGatewayOptions = {
  readonly hookRegistry: Context.Tag.Service<typeof HookRegistry>;
  readonly worm: Context.Tag.Service<typeof WormAuditSink>;
  readonly atrScopeTokens?: readonly string[];
};

function sessionIdFor(request: InferenceRequest): string {
  return request.correlationId ?? request.virtualKeyId ?? request.tenantId ?? "inference";
}

function applyRedactedMessages(
  request: InferenceRequest,
  result: HookResult
): InferenceRequest {
  if (result.redactedPayload === undefined) return request;
  const payload = result.redactedPayload as { messages?: InferenceRequest["messages"] };
  if (payload.messages) return { ...request, messages: payload.messages };
  return request;
}

function applyRedactedContent(response: InferenceResponse, result: HookResult): InferenceResponse {
  if (result.redactedPayload === undefined) return response;
  if (typeof result.redactedPayload === "string") {
    return { ...response, content: result.redactedPayload };
  }
  const payload = result.redactedPayload as { content?: string };
  if (payload.content !== undefined) return { ...response, content: payload.content };
  return response;
}

/** Wrap an InferenceGateway so blocking pre-model / post-model hooks run via fireHook. */
export function withModelLifecycleHooks(
  inner: InferenceGateway,
  options: HookedInferenceGatewayOptions
): InferenceGateway {
  return {
    async complete(request: InferenceRequest): Promise<InferenceResponse> {
      const session = {
        id: sessionIdFor(request),
        atrScope: atrScopeFromTokens(options.atrScopeTokens ?? []),
      };

      const preListed = await Effect.runPromise(
        options.hookRegistry.list("pre-model")
      );
      let working = request;
      if (preListed.length > 0) {
        const pre = await Effect.runPromise(
          fireHooksForEvent(
            preListed,
            { session, payload: { messages: request.messages } },
            { stopOnDeny: true }
          ).pipe(Effect.provideService(WormAuditSink, options.worm))
        );
        if (!pre.allow) {
          throw new Error(pre.denyReason ?? "pre-model hook denied inference");
        }
        working = applyRedactedMessages(request, pre);
      }

      const response = await inner.complete(working);

      const postListed = await Effect.runPromise(
        options.hookRegistry.list("post-model")
      );
      if (postListed.length === 0) return response;

      const post = await Effect.runPromise(
        fireHooksForEvent(
          postListed,
          { session, payload: { content: response.content, model: response.model } },
          { stopOnDeny: true }
        ).pipe(Effect.provideService(WormAuditSink, options.worm))
      );
      if (!post.allow) {
        throw new Error(post.denyReason ?? "post-model hook denied inference response");
      }
      return applyRedactedContent(response, post);
    },
  };
}
