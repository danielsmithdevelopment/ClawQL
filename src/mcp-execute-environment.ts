/**
 * MCP-side IO boundary for clawql-api execute core (native GraphQL/gRPC remain in transport).
 */

import type { ExecuteEnvironment } from "clawql-api";
import { loadSpec } from "clawql-api";
import { executeNativeGrpc } from "./execute-native-grpc.js";
import { executeNativeGraphQL } from "./execute-native-graphql.js";
import type { Operation } from "./operation-types.js";

export const mcpExecuteEnvironment: ExecuteEnvironment = {
  loadSpec: async () => {
    const loaded = await loadSpec();
    return { ...loaded, multi: loaded.multi ?? false };
  },
  executeNativeGraphQL: (op, args, selectedFields) =>
    executeNativeGraphQL(op as Operation, args, selectedFields),
  executeNativeGrpc: (op, args) => executeNativeGrpc(op as Operation, args),
};
