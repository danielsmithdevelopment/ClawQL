import { describe, expect, it, vi } from "vitest";
import {
  getGraphQLSource,
  getGrpcClient,
  registerGraphQLSource,
  registerGrpcClient,
  resetNativeProtocolRegistry,
} from "./native-protocol-registry.js";

describe("native-protocol-registry", () => {
  it("registers and returns GraphQL source metadata", () => {
    resetNativeProtocolRegistry();
    registerGraphQLSource("g1", "https://api.example/graphql", { Authorization: "Bearer x" });
    expect(getGraphQLSource("g1")).toEqual({
      endpoint: "https://api.example/graphql",
      headers: { Authorization: "Bearer x" },
    });
    expect(getGraphQLSource("missing")).toBeUndefined();
    resetNativeProtocolRegistry();
    expect(getGraphQLSource("g1")).toBeUndefined();
  });

  it("registers gRPC client and resetNativeProtocolRegistry closes clients", () => {
    resetNativeProtocolRegistry();
    const close = vi.fn();
    const client = { close } as unknown as import("@grpc/grpc-js").Client;
    registerGrpcClient("k1", client);
    expect(getGrpcClient("k1")).toBe(client);
    resetNativeProtocolRegistry();
    expect(close).toHaveBeenCalledOnce();
    expect(getGrpcClient("k1")).toBeUndefined();
  });
});
