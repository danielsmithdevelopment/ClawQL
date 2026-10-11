import { describe, expect, it } from "vitest";
import { getClawqlOptionalToolFlags } from "clawql-api";

describe("getClawqlOptionalToolFlags", () => {
  it("defaults memory and documents on; other optional CLAWQL_ENABLE_* off", () => {
    const f = getClawqlOptionalToolFlags({
      ...process.env,
      ENABLE_GRPC: undefined,
      ENABLE_GRPC_REFLECTION: undefined,
      CLAWQL_EXTERNAL_INGEST: undefined,
      CLAWQL_ENABLE_MEMORY: undefined,
      CLAWQL_ENABLE_DOCUMENTS: undefined,
      CLAWQL_ENABLE_SCHEDULE: undefined,
      CLAWQL_ENABLE_NOTIFY: undefined,
      CLAWQL_ENABLE_WORKFLOW: undefined,
      CLAWQL_ENABLE_ONYX: undefined,
      CLAWQL_ENABLE_SANDBOX: undefined,
      CLAWQL_ENABLE_DATA: undefined,
      CLAWQL_ENABLE_CLAWQL_SQL_ALIAS: undefined,
      CLAWQL_ENABLE_WEB: undefined,
      CLAWQL_ENABLE_HITL_LABEL_STUDIO: undefined,
      CLAWQL_ENABLE_CONESHARE: undefined,
      CLAWQL_ENABLE_IDP_PIPELINE: undefined,
      CLAWQL_ENABLE_IDP_CLASSIFIER: undefined,
      CLAWQL_ENABLE_LANGEXTRACT: undefined,
      CLAWQL_ENABLE_PDF_INSPECTOR: undefined,
      CLAWQL_ENABLE_ANYDOC: undefined,
      CLAWQL_ENABLE_LANGFUSE_EVAL: undefined,
      CLAWQL_ENABLE_OUROBOROS_TOOLS: undefined,
      CLAWQL_ENABLE_SUPABASE: undefined,
    });
    expect(f.enableGrpc).toBe(false);
    expect(f.enableSupabase).toBe(false);
    expect(f.enableGrpcReflection).toBe(false);
    expect(f.externalIngestPreview).toBe(false);
    expect(f.enableMemory).toBe(true);
    expect(f.enableDocuments).toBe(true);
    expect(f.enableSchedule).toBe(false);
    expect(f.enableNotify).toBe(false);
    expect(f.enableWorkflow).toBe(false);
    expect(f.enableOnyxKnowledge).toBe(false);
    expect(f.enableSandbox).toBe(false);
    expect(f.enableData).toBe(false);
    expect(f.enableClawqlSqlAlias).toBe(false);
    expect(f.enableWeb).toBe(false);
    expect(f.enableHitlLabelStudio).toBe(false);
    expect(f.enableConeshare).toBe(false);
    expect(f.enableIdpPipeline).toBe(false);
    expect(f.enableIdpClassifier).toBe(false);
    expect(f.enableLangextract).toBe(false);
    expect(f.enablePdfInspector).toBe(false);
    expect(f.enableAnydoc).toBe(false);
    expect(f.enableLangfuseEval).toBe(false);
    expect(f.enableOuroborosTools).toBe(false);
  });

  it("defaults enableOuroborosTools off; CLAWQL_ENABLE_OUROBOROS_TOOLS=1 enables agent-facing ouroboros_* / clawql_think", () => {
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_ENABLE_OUROBOROS_TOOLS: undefined } as NodeJS.ProcessEnv)
        .enableOuroborosTools
    ).toBe(false);
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_ENABLE_OUROBOROS_TOOLS: "1" } as NodeJS.ProcessEnv)
        .enableOuroborosTools
    ).toBe(true);
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_ENABLE_OUROBOROS_TOOLS: "0" } as NodeJS.ProcessEnv)
        .enableOuroborosTools
    ).toBe(false);
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

  it("parses CLAWQL_ENABLE_CLAWQL_SQL_ALIAS", () => {
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_ENABLE_CLAWQL_SQL_ALIAS: "1" } as NodeJS.ProcessEnv)
        .enableClawqlSqlAlias
    ).toBe(true);
    expect(
      getClawqlOptionalToolFlags({ CLAWQL_ENABLE_CLAWQL_SQL_ALIAS: undefined } as NodeJS.ProcessEnv)
        .enableClawqlSqlAlias
    ).toBe(false);
  });

  it("can disable memory and documents with explicit 0", () => {
    const off = getClawqlOptionalToolFlags({
      CLAWQL_ENABLE_MEMORY: "0",
      CLAWQL_ENABLE_DOCUMENTS: "0",
    } as NodeJS.ProcessEnv);
    expect(off.enableMemory).toBe(false);
    expect(off.enableDocuments).toBe(false);
  });

  it("parses planned CLAWQL_ENABLE_* flags", () => {
    const f = getClawqlOptionalToolFlags({
      CLAWQL_ENABLE_MEMORY: "1",
      CLAWQL_ENABLE_SCHEDULE: "yes",
      CLAWQL_ENABLE_NOTIFY: "TRUE",
      CLAWQL_ENABLE_WORKFLOW: "1",
      CLAWQL_ENABLE_ONYX: "1",
      CLAWQL_ENABLE_SANDBOX: "1",
      CLAWQL_ENABLE_DATA: "1",
      CLAWQL_ENABLE_CLAWQL_SQL_ALIAS: "1",
      CLAWQL_ENABLE_WEB: "1",
      CLAWQL_ENABLE_DOCUMENTS: "1",
      CLAWQL_ENABLE_IDP_PIPELINE: "1",
      CLAWQL_ENABLE_IDP_CLASSIFIER: "1",
      CLAWQL_ENABLE_LANGEXTRACT: "1",
      CLAWQL_ENABLE_PDF_INSPECTOR: "1",
      CLAWQL_ENABLE_ANYDOC: "1",
      CLAWQL_ENABLE_LANGFUSE_EVAL: "1",
      CLAWQL_ENABLE_OUROBOROS_TOOLS: "1",
      CLAWQL_ENABLE_SUPABASE: "1",
    } as NodeJS.ProcessEnv);
    expect(f.enableMemory).toBe(true);
    expect(f.enableSupabase).toBe(true);
    expect(f.enableDocuments).toBe(true);
    expect(f.enableSchedule).toBe(true);
    expect(f.enableNotify).toBe(true);
    expect(f.enableWorkflow).toBe(true);
    expect(f.enableOnyxKnowledge).toBe(true);
    expect(f.enableSandbox).toBe(true);
    expect(f.enableData).toBe(true);
    expect(f.enableClawqlSqlAlias).toBe(true);
    expect(f.enableWeb).toBe(true);
    expect(f.enableIdpPipeline).toBe(true);
    expect(f.enableIdpClassifier).toBe(true);
    expect(f.enableLangextract).toBe(true);
    expect(f.enablePdfInspector).toBe(true);
    expect(f.enableAnydoc).toBe(true);
    expect(f.enableLangfuseEval).toBe(true);
    expect(f.enableOuroborosTools).toBe(true);
  });
});
