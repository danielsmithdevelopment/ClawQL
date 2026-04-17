import * as protoLoader from "@grpc/proto-loader";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ReflectionService } from "@grpc/reflection";
import { patchProtoLoaderPackageDefinitionForReflection } from "./proto-loader-reflection-patch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const protoRoot = join(__dirname, "../proto");
const wellKnownProtoRoot = dirname(require.resolve("google-proto-files/package.json"));

function loadMcpDefinition(): protoLoader.PackageDefinition {
  return protoLoader.loadSync(
    [
      join(wellKnownProtoRoot, "google/protobuf/struct.proto"),
      join(wellKnownProtoRoot, "google/protobuf/duration.proto"),
      join(protoRoot, "model_context_protocol/mcp.proto"),
    ],
    {
      includeDirs: [protoRoot, wellKnownProtoRoot],
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }
  );
}

describe("patchProtoLoaderPackageDefinitionForReflection", () => {
  it("adds WKT file dependency and protoc-style map entry names for strict reflection clients", () => {
    const def = loadMcpDefinition();
    patchProtoLoaderPackageDefinitionForReflection(def);

    const r = new ReflectionService(def, { services: ["model_context_protocol.Mcp"] });
    const mcp = r.v1.files["model_context_protocol.proto"];
    expect(mcp?.dependency).toContain("google_protobuf.proto");

    const google = r.v1.files["google_protobuf.proto"];
    const struct = google?.messageType?.find((x) => x.name === "Struct");
    const entry = struct?.nestedType?.find((x) => x.options?.mapEntry);
    expect(entry?.name).toBe("FieldsEntry");
    const fields = struct?.field?.find((f) => f.name === "fields");
    expect(fields?.typeName).toBe(".google.protobuf.Struct.FieldsEntry");

    const rf = mcp?.messageType?.find((x) => x.name === "RequestFields");
    const depEntry = rf?.nestedType?.find((x) => x.name === "DependentResponsesEntry");
    expect(depEntry?.options?.mapEntry).toBe(true);

    const log = mcp?.messageType?.find((x) => x.name === "LogMessage");
    const data = log?.field?.find((f) => f.name === "data");
    expect(data?.typeName).toBe(".google.protobuf.Value");
  });
});
