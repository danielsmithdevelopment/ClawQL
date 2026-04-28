import { describe, expect, it } from "vitest";
import {
  getNativeProtocolMetricsSnapshot,
  nativeProtocolMetricsEnabled,
  recordNativeGrpcExecute,
  recordNativeGraphqlExecute,
  recordNativeMergeCounts,
  resetNativeProtocolMetricsForTests,
} from "./native-protocol-metrics.js";

describe("native-protocol-metrics", () => {
  it("records merge counts and execute outcomes", () => {
    resetNativeProtocolMetricsForTests();
    recordNativeMergeCounts(3, 2);
    recordNativeGraphqlExecute(true);
    recordNativeGraphqlExecute(false);
    recordNativeGrpcExecute(true);

    const snap = getNativeProtocolMetricsSnapshot();
    expect(snap.graphqlMergedOperations).toBe(3);
    expect(snap.grpcMergedOperations).toBe(2);
    expect(snap.graphqlExecuteOk).toBe(1);
    expect(snap.graphqlExecuteErr).toBe(1);
    expect(snap.grpcExecuteOk).toBe(1);
    expect(snap.grpcExecuteErr).toBe(0);

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
