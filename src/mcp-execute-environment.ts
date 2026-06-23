/**
 * MCP-side IO boundary for clawql-api execute core (native GraphQL/gRPC + in-process GraphQL remain in transport).
 */

import type { ExecuteEnvironment } from "clawql-api";
import { loadSpec, type OpenAPIDoc } from "clawql-api";
import { executeNativeGrpc } from "./execute-native-grpc.js";
import { executeNativeGraphQL } from "./execute-native-graphql.js";
import { executeOperationGraphQL } from "./graphql-in-process-execute.js";
import type { Operation } from "./operation-types.js";

export const mcpExecuteEnvironment: ExecuteEnvironment = {
  loadSpec: async () => {
    const loaded = await loadSpec();
    return { ...loaded, multi: loaded.multi ?? false };
  },
  executeNativeGraphQL: (op, args, selectedFields) =>
    executeNativeGraphQL(op as Operation, args, selectedFields),
  executeNativeGrpc: (op, args) => executeNativeGrpc(op as Operation, args),
  executeOperationGraphQL: (openapi, baseUrl, op, args, selectedFields) =>
    executeOperationGraphQL(openapi as OpenAPIDoc, baseUrl, op as Operation, args, selectedFields),
};
