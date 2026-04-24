import { describe, expect, it } from "vitest";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";

describe("getClawqlOptionalToolFlags", () => {
  it("defaults all optional CLAWQL_ENABLE_* to false", () => {
    const f = getClawqlOptionalToolFlags({
      ...process.env,
      ENABLE_GRPC: undefined,
      ENABLE_GRPC_REFLECTION: undefined,
      CLAWQL_EXTERNAL_INGEST: undefined,
      CLAWQL_ENABLE_CACHE: undefined,
      CLAWQL_ENABLE_SCHEDULE: undefined,
      CLAWQL_ENABLE_NOTIFY: undefined,
      CLAWQL_ENABLE_VISION: undefined,
      CLAWQL_ENABLE_AUDIT: undefined,
      CLAWQL_ENABLE_ONYX: undefined,
      CLAWQL_ENABLE_OUROBOROS: undefined,
    });
    expect(f.enableGrpc).toBe(false);
    expect(f.enableGrpcReflection).toBe(false);
    expect(f.externalIngestPreview).toBe(false);
    expect(f.enableCache).toBe(false);
    expect(f.enableSchedule).toBe(false);
    expect(f.enableNotify).toBe(false);
    expect(f.enableVision).toBe(false);
    expect(f.enableAudit).toBe(false);
    expect(f.enableOnyxKnowledge).toBe(false);
    expect(f.enableOuroboros).toBe(false);
  });

  it("parses ENABLE_GRPC and ENABLE_GRPC_REFLECTION", () => {
    expect(getClawqlOptionalToolFlags({ ENABLE_GRPC: "1" } as NodeJS.ProcessEnv).enableGrpc).toBe(
      true
    );
    expect(
      getClawqlOptionalToolFlags({ ENABLE_GRPC: "true" } as NodeJS.ProcessEnv).enableGrpc
    ).toBe(true);
    expect(
      getClawqlOptionalToolFlags({ ENABLE_GRPC_REFLECTION: "1" } as NodeJS.ProcessEnv)
        .enableGrpcReflection
    ).toBe(true);
  });

  it("requires CLAWQL_EXTERNAL_INGEST exactly 1 for preview", () => {
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_EXTERNAL_INGEST: "1" } as NodeJS.ProcessEnv)
        .externalIngestPreview
    ).toBe(true);
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_EXTERNAL_INGEST: "true" } as NodeJS.ProcessEnv)
        .externalIngestPreview
    ).toBe(false);
  });

  it("parses planned CLAWQL_ENABLE_* flags", () => {
    const f = getClawqlOptionalToolFlags({
      CLAWQL_ENABLE_CACHE: "1",
      CLAWQL_ENABLE_SCHEDULE: "yes",
      CLAWQL_ENABLE_NOTIFY: "TRUE",
      CLAWQL_ENABLE_VISION: "0",
      CLAWQL_ENABLE_AUDIT: "true",
      CLAWQL_ENABLE_ONYX: "1",
      CLAWQL_ENABLE_OUROBOROS: "yes",
    } as NodeJS.ProcessEnv);
    expect(f.enableCache).toBe(true);
    expect(f.enableSchedule).toBe(true);
    expect(f.enableNotify).toBe(true);
    expect(f.enableVision).toBe(false);
    expect(f.enableAudit).toBe(true);
    expect(f.enableOnyxKnowledge).toBe(true);
    expect(f.enableOuroboros).toBe(true);
  });
});
