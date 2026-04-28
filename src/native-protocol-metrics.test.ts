import { describe, expect, it } from "vitest";
import {
  getNativeProtocolMetricsSnapshot,
  nativeProtocolMetricsEnabled,
  recordNativeGrpcExecute,
  recordNativeGraphqlExecute,
  recordNativeMergeFromOperations,
  resetNativeProtocolMetricsForTests,
} from "./native-protocol-metrics.js";
import { renderPrometheusMetrics } from "./native-protocol-prometheus.js";
import type { Operation } from "./operation-types.js";

function gqlOp(label: string): Operation {
  return {
    id: `gql-${label}`,
    method: "POST",
    path: "/",
    flatPath: "/",
    description: "",
    resource: "",
    parameters: {},
    scopes: [],
    protocolKind: "graphql",
    nativeGraphQL: {
      sourceLabel: label,
      operationType: "query",
      fieldName: "x",
    },
  };
}

function grpcOp(label: string): Operation {
  return {
    id: `grpc-${label}`,
    method: "GRPC",
    path: "/",
    flatPath: "/",
    description: "",
    resource: "",
    parameters: {},
    scopes: [],
    protocolKind: "grpc",
    nativeGrpc: {
      sourceLabel: label,
      clientKey: `${label}::svc`,
      rpcName: "Unary",
    },
  };
}

describe("native-protocol-metrics", () => {
  it("records merge counts and execute outcomes (globals + per source)", () => {
    resetNativeProtocolMetricsForTests();
    recordNativeMergeFromOperations([gqlOp("g1"), gqlOp("g1"), gqlOp("g2")], [grpcOp("r1")]);

    recordNativeGraphqlExecute(true, "g1");
    recordNativeGraphqlExecute(false, "g1");
    recordNativeGraphqlExecute(true, "g2");
    recordNativeGrpcExecute(true, "r1");

    const snap = getNativeProtocolMetricsSnapshot();
    expect(snap.graphqlMergedOperations).toBe(3);
    expect(snap.grpcMergedOperations).toBe(1);
    expect(snap.graphqlExecuteOk).toBe(2);
    expect(snap.graphqlExecuteErr).toBe(1);
    expect(snap.grpcExecuteOk).toBe(1);
    expect(snap.grpcExecuteErr).toBe(0);

    const gqlBy = snap.graphqlBySource as Record<
      string,
      { mergedOperations: number; executeOk: number; executeErr: number }
    >;
    const grpcBy = snap.grpcBySource as Record<
      string,
      { mergedOperations: number; executeOk: number; executeErr: number }
    >;

    expect(gqlBy.g1).toEqual({ mergedOperations: 2, executeOk: 1, executeErr: 1 });
    expect(gqlBy.g2).toEqual({ mergedOperations: 1, executeOk: 1, executeErr: 0 });
    expect(grpcBy.r1).toEqual({ mergedOperations: 1, executeOk: 1, executeErr: 0 });

    resetNativeProtocolMetricsForTests();
  });

  it("Prometheus exposition mirrors merge and execute state", async () => {
    resetNativeProtocolMetricsForTests();
    recordNativeMergeFromOperations([gqlOp("g1"), gqlOp("g1")], [grpcOp("r1")]);
    recordNativeGraphqlExecute(true, "g1");
    recordNativeGrpcExecute(false, "r1");

    const { body, contentType } = await renderPrometheusMetrics();
    expect(contentType).toMatch(/text\/plain/);
    expect(body).toContain("# HELP clawql_native_protocol_graphql_merge_operations");
    expect(body).toContain("# HELP clawql_native_protocol_grpc_merge_operations");
    expect(body).toContain("# HELP clawql_native_protocol_graphql_execute_total");
    expect(body).toContain("# HELP clawql_native_protocol_grpc_execute_total");
    expect(body).toMatch(/clawql_native_protocol_graphql_merge_operations\{source="g1"\}/);
    expect(body).toMatch(/clawql_native_protocol_grpc_merge_operations\{source="r1"\}/);
    expect(body).toMatch(
      /clawql_native_protocol_graphql_execute_total\{.*source="g1".*outcome="ok"\}/
    );
    expect(body).toMatch(
      /clawql_native_protocol_grpc_execute_total\{.*source="r1".*outcome="error"\}/
    );

    resetNativeProtocolMetricsForTests();
  });

  it("merge refresh updates mergedOperations gauges without resetting execute counters", () => {
    resetNativeProtocolMetricsForTests();
    recordNativeMergeFromOperations([gqlOp("alpha")], []);
    recordNativeGraphqlExecute(true, "alpha");

    recordNativeMergeFromOperations([], []);

    const snap = getNativeProtocolMetricsSnapshot();
    expect(snap.graphqlMergedOperations).toBe(0);
    const gqlBy = snap.graphqlBySource as Record<
      string,
      { mergedOperations: number; executeOk: number }
    >;
    expect(gqlBy.alpha.mergedOperations).toBe(0);
    expect(gqlBy.alpha.executeOk).toBe(1);

    resetNativeProtocolMetricsForTests();
  });

  it("nativeProtocolMetricsEnabled follows env", () => {
    const prev = process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
    delete process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
    expect(nativeProtocolMetricsEnabled()).toBe(false);
    process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS = "1";
    expect(nativeProtocolMetricsEnabled()).toBe(true);
    if (prev === undefined) delete process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
    else process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS = prev;
  });
});
