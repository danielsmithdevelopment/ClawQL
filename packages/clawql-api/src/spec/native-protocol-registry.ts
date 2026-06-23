/**
 * Runtime registry for native GraphQL endpoints and gRPC clients (cleared with spec cache).
 */

import type * as grpc from "@grpc/grpc-js";

const graphqlSources = new Map<string, { endpoint: string; headers: Record<string, string> }>();

const grpcClients = new Map<string, grpc.Client>();

export function registerGraphQLSource(
  label: string,
  endpoint: string,
  headers: Record<string, string>
): void {
  graphqlSources.set(label, { endpoint, headers });
}

export function getGraphQLSource(
  label: string
): { endpoint: string; headers: Record<string, string> } | undefined {
  return graphqlSources.get(label);
}

export function registerGrpcClient(key: string, client: grpc.Client): void {
  grpcClients.set(key, client);
}

export function getGrpcClient(key: string): grpc.Client | undefined {
  return grpcClients.get(key);
}

export function resetNativeProtocolRegistry(): void {
  for (const c of grpcClients.values()) {
    try {
      c.close();
    } catch {
      /* noop */
    }
  }
  grpcClients.clear();
  graphqlSources.clear();
}
