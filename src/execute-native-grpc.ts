/**
 * Unary gRPC execution using grpc-js clients registered during spec load.
 */

import * as grpc from "@grpc/grpc-js";
import type { Operation } from "./operation-types.js";
import { mergedAuthHeaders } from "./auth-headers.js";
import { recordNativeGrpcExecute } from "./native-protocol-metrics.js";
import { getGrpcClient } from "./native-protocol-registry.js";

export async function executeNativeGrpc(
  op: Operation,
  args: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const meta = op.nativeGrpc;
  if (!meta) {
    const r = { ok: false as const, error: "Internal error: missing nativeGrpc metadata" };
    recordNativeGrpcExecute(false);
    return r;
  }
  const client = getGrpcClient(meta.clientKey);
  if (!client) {
    const r = { ok: false as const, error: `Unknown gRPC client: ${meta.clientKey}` };
    recordNativeGrpcExecute(false, meta.sourceLabel);
    return r;
  }

  const metadata = new grpc.Metadata();
  for (const [k, v] of Object.entries(mergedAuthHeaders(meta.sourceLabel))) {
    metadata.set(k, v);
  }

  type UnaryCall = (
    argument: unknown,
    md: grpc.Metadata,
    callback: (error: grpc.ServiceError | null, response: unknown) => void
  ) => grpc.ClientUnaryCall;

  const fn = (client as unknown as Record<string, UnaryCall | unknown>)[meta.rpcName];
  if (typeof fn !== "function") {
    const r = { ok: false as const, error: `gRPC client has no method ${meta.rpcName}` };
    recordNativeGrpcExecute(false, meta.sourceLabel);
    return r;
  }

  return new Promise((resolve) => {
    fn.call(client, args, metadata, (err: grpc.ServiceError | null, response: unknown) => {
      if (err) {
        recordNativeGrpcExecute(false, meta.sourceLabel);
        resolve({ ok: false, error: err.message });
      } else {
        recordNativeGrpcExecute(true, meta.sourceLabel);
        resolve({ ok: true, data: response });
      }
    });
  });
}
