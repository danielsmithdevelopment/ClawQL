/**
 * Patches `@grpc/proto-loader` FileDescriptorProtos so they match what `protoc`
 * emits and what strict clients (e.g. grpcurl / jhump/protoreflect) expect.
 *
 * 1. **Map entries:** proto-loader names synthetic map entry messages incorrectly
 *    (`Fields`, `Dependent_responses`, …). Protoc uses `FieldsEntry`,
 *    `DependentResponsesEntry`, … and `type_name` values like
 *    `.pkg.Parent.DependentResponsesEntry`.
 * 2. **Absolute type names:** cross-package message references must use a leading
 *    `.` on `type_name` (e.g. `.google.protobuf.Value`).
 * 3. **Imports:** `model_context_protocol.proto` must list `google_protobuf.proto`
 *    in `dependency` so reflection clients resolve WKTs via `CreateFileDescriptor`.
 */

import { createRequire } from "node:module";
import type * as protoLoader from "@grpc/proto-loader";

const require = createRequire(import.meta.url);
const descriptor = require("protobufjs/ext/descriptor") as {
  FileDescriptorProto: {
    decode(buf: Uint8Array): MutableFileDescriptorProto;
    encode(msg: MutableFileDescriptorProto): { finish(): Uint8Array };
  };
};

type MutableFileDescriptorProto = {
  name?: string | null;
  package?: string | null;
  dependency?: string[];
  messageType?: MutableDescriptorProto[];
  extension?: MutableFieldDescriptorProto[];
};

type MutableDescriptorProto = {
  name?: string | null;
  field?: MutableFieldDescriptorProto[];
  nestedType?: MutableDescriptorProto[];
  extension?: MutableFieldDescriptorProto[];
  options?: { mapEntry?: boolean | null };
};

type MutableFieldDescriptorProto = {
  name?: string | null;
  type?: number | null;
  label?: number | null;
  typeName?: string | null;
};

const LABEL_REPEATED = 3;
const TYPE_MESSAGE = 11;

function snakeToPascal(name: string): string {
  return name
    .split("_")
    .filter((p) => p.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function mapEntryTypeName(fieldName: string): string {
  return `${snakeToPascal(fieldName)}Entry`;
}

function normalizeAbsoluteTypeName(typeName: string | null | undefined): string | null | undefined {
  if (!typeName || typeName.startsWith(".")) {
    return typeName ?? undefined;
  }
  if (typeName.includes(".")) {
    return `.${typeName}`;
  }
  return typeName;
}

function patchFieldTypeNames(field: MutableFieldDescriptorProto): void {
  if (field.typeName) {
    field.typeName = normalizeAbsoluteTypeName(field.typeName) ?? field.typeName;
  }
}

function patchMapEntriesInMessage(parentFqn: string, msg: MutableDescriptorProto): void {
  const nested = msg.nestedType ?? [];
  for (const mapEntry of nested) {
    if (!mapEntry.options?.mapEntry) {
      continue;
    }
    const mapField = msg.field?.find((f) => {
      if (f.label !== LABEL_REPEATED || f.type !== TYPE_MESSAGE || !f.typeName || !mapEntry.name) {
        return false;
      }
      const last = f.typeName.replace(/^\./, "").split(".").pop() ?? "";
      return last === mapEntry.name;
    });
    if (!mapField?.name) {
      continue;
    }
    const correct = mapEntryTypeName(mapField.name);
    if (mapEntry.name === correct && mapField.typeName?.endsWith(`.${correct}`)) {
      continue;
    }
    mapEntry.name = correct;
    mapField.typeName = `.${parentFqn}.${correct}`;
  }

  for (const child of nested) {
    if (child.options?.mapEntry) {
      continue;
    }
    if (!child.name) {
      continue;
    }
    patchMapEntriesInMessage(`${parentFqn}.${child.name}`, child);
  }

  for (const f of msg.field ?? []) {
    patchFieldTypeNames(f);
  }
  for (const f of msg.extension ?? []) {
    patchFieldTypeNames(f);
  }
}

function patchFileDescriptorProto(file: MutableFileDescriptorProto): void {
  const pkg = file.package?.trim() ?? "";
  for (const ext of file.extension ?? []) {
    patchFieldTypeNames(ext);
  }
  for (const top of file.messageType ?? []) {
    if (!top.name) {
      continue;
    }
    const parentFqn = pkg ? `${pkg}.${top.name}` : top.name;
    patchMapEntriesInMessage(parentFqn, top);
  }

  if (file.name === "model_context_protocol.proto") {
    const deps = file.dependency ?? (file.dependency = []);
    if (!deps.includes("google_protobuf.proto")) {
      deps.push("google_protobuf.proto");
    }
  }
}

/**
 * Mutates `def` in place: decodes each unique `FileDescriptorProto` once, patches,
 * re-encodes, and assigns the patched bytes back to every symbol that references it.
 */
export function patchProtoLoaderPackageDefinitionForReflection(
  def: protoLoader.PackageDefinition
): void {
  const seen = new Map<string, Uint8Array>();

  for (const v of Object.values(def)) {
    if (!v || typeof v !== "object" || !("fileDescriptorProtos" in v)) {
      continue;
    }
    const withProtos = v as { fileDescriptorProtos?: Uint8Array[] };
    const fdps = withProtos.fileDescriptorProtos;
    if (!Array.isArray(fdps)) {
      continue;
    }
    for (let i = 0; i < fdps.length; i++) {
      const bin = fdps[i];
      const proto = descriptor.FileDescriptorProto.decode(bin);
      if (!proto.name) {
        continue;
      }
      let out = seen.get(proto.name);
      if (!out) {
        patchFileDescriptorProto(proto as MutableFileDescriptorProto);
        out = descriptor.FileDescriptorProto.encode(proto).finish();
        seen.set(proto.name, out);
      }
      fdps[i] = out;
    }
  }
}
