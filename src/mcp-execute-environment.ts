/**
 * MCP-side IO boundary for clawql-api execute core (until spec-loader migrates).
 */

import type { ExecuteEnvironment } from "clawql-api";
import { executeNativeGrpc } from "./execute-native-grpc.js";
import { executeNativeGraphQL } from "./execute-native-graphql.js";
import { executeOperationGraphQL } from "./graphql-in-process-execute.js";
import type { Operation } from "./operation-types.js";
import { executeRestOperation } from "./rest-operation.js";
import { loadSpec, resolveApiBaseUrlForOperation, type OpenAPIDoc } from "./spec-loader.js";

export const mcpExecuteEnvironment: ExecuteEnvironment = {
  loadSpec: async () => {
    const loaded = await loadSpec();
    return { ...loaded, multi: loaded.multi ?? false };
  },
  executeNativeGraphQL: (op, args, selectedFields) =>
    executeNativeGraphQL(op as Operation, args, selectedFields),
  executeNativeGrpc: (op, args) => executeNativeGrpc(op as Operation, args),
  executeRestOperation: (op, args, openapi) =>
    executeRestOperation(op as Operation, args, openapi as OpenAPIDoc),
  executeOperationGraphQL: (openapi, baseUrl, op, args, selectedFields) =>
    executeOperationGraphQL(openapi as OpenAPIDoc, baseUrl, op as Operation, args, selectedFields),
  resolveApiBaseUrlForOperation: (openapi, op) =>
    resolveApiBaseUrlForOperation(openapi as OpenAPIDoc, op as Operation),
};
