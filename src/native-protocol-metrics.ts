/**
 * Lightweight counters for native GraphQL/gRPC merge + execute (ADR #191).
 * Optional **`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`** exposes a snapshot on **`GET /healthz`**.
 */

let graphqlMergedOps = 0;
let grpcMergedOps = 0;
let graphqlExecuteOk = 0;
let graphqlExecuteErr = 0;
let grpcExecuteOk = 0;
let grpcExecuteErr = 0;

export function recordNativeMergeCounts(graphqlOperations: number, grpcOperations: number): void {
  graphqlMergedOps = graphqlOperations;
  grpcMergedOps = grpcOperations;
}

export function recordNativeGraphqlExecute(ok: boolean): void {
  if (ok) graphqlExecuteOk += 1;
  else graphqlExecuteErr += 1;
}

export function recordNativeGrpcExecute(ok: boolean): void {
  if (ok) grpcExecuteOk += 1;
  else grpcExecuteErr += 1;
}

export function nativeProtocolMetricsEnabled(): boolean {
  return process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS?.trim() === "1";
}

export function getNativeProtocolMetricsSnapshot(): Record<string, unknown> {
  return {
    graphqlMergedOperations: graphqlMergedOps,
    grpcMergedOperations: grpcMergedOps,
    graphqlExecuteOk,
    graphqlExecuteErr,
    grpcExecuteOk,
    grpcExecuteErr,
  };
}

/** Vitest only — resets counters between tests. */
export function resetNativeProtocolMetricsForTests(): void {
  graphqlMergedOps = 0;
  grpcMergedOps = 0;
  graphqlExecuteOk = 0;
  graphqlExecuteErr = 0;
  grpcExecuteOk = 0;
  grpcExecuteErr = 0;
}
