/**
 * Load unary gRPC operations from proto definitions via @grpc/proto-loader.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve as resolvePath } from "node:path";
import type { Operation } from "./operation-types.js";
import { normalizeOperationId } from "./spec-kind.js";
import type { GrpcSourceConfig } from "./native-protocol-env.js";
import { parseGrpcSourcesEnv } from "./native-protocol-env.js";
import { registerGrpcClient } from "./native-protocol-registry.js";

type ServiceCtor = grpc.ServiceClientConstructor;

function walkServices(
  obj: grpc.GrpcObject,
  path: string[],
  out: Array<{ fqName: string; ctor: ServiceCtor }>
): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "function" && val !== null && "service" in val) {
      const ctor = val as ServiceCtor;
      if (ctor.service && typeof ctor.service === "object") {
        out.push({ fqName: [...path, key].join("."), ctor });
      }
      continue;
    }
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof val !== "function"
    ) {
      walkServices(val as grpc.GrpcObject, [...path, key], out);
    }
  }
}

async function loadOne(cfg: GrpcSourceConfig): Promise<Operation[]> {
  const absProto = resolvePath(process.cwd(), cfg.protoPath);
  const packageDefinition = await protoLoader.load(absProto, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const root = grpc.loadPackageDefinition(packageDefinition) as grpc.GrpcObject;

  const creds =
    cfg.insecure === true ? grpc.credentials.createInsecure() : grpc.credentials.createSsl();

  const services: Array<{ fqName: string; ctor: ServiceCtor }> = [];
  walkServices(root, [], services);

  const ops: Operation[] = [];

  for (const { fqName, ctor } of services) {
    const clientKey = `${cfg.name}::${fqName}`;
    const client = new ctor(cfg.endpoint, creds);
    registerGrpcClient(clientKey, client);

    const serviceDef = ctor.service as grpc.ServiceDefinition;
    for (const rpcName of Object.keys(serviceDef)) {
      const methodDef = serviceDef[rpcName];
      if (!methodDef || methodDef.requestStream || methodDef.responseStream) continue;
      const methodName = rpcName;
      const segment = `${fqName}.${methodName}`;
      ops.push({
        id: normalizeOperationId("grpc", cfg.name, segment),
        method: "GRPC",
        path: `grpc/${cfg.name}/${fqName}/${methodName}`,
        flatPath: `grpc/${cfg.name}/${fqName}/${methodName}`,
        description: `gRPC ${fqName}.${methodName}`,
        resource: methodName,
        parameters: {},
        scopes: [],
        protocolKind: "grpc",
        specLabel: cfg.name,
        nativeGrpc: {
          sourceLabel: cfg.name,
          clientKey,
          rpcName,
        },
      });
    }
  }

  return ops;
}

/** Exported for tests with injected configs. */
export async function loadGrpcNativeOperationsFromConfigs(
  configs: GrpcSourceConfig[]
): Promise<Operation[]> {
  const out: Operation[] = [];
  for (const cfg of configs) {
    try {
      out.push(...(await loadOne(cfg)));
    } catch (e: unknown) {
      console.error(`[native-protocol] gRPC source "${cfg.name}" failed:`, e);
    }
  }
  return out;
}

export async function loadGrpcNativeOperations(): Promise<Operation[]> {
  return loadGrpcNativeOperationsFromConfigs(parseGrpcSourcesEnv());
}
