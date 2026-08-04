import { describe, expect, it, vi } from "vitest";
import { runIdpPipeline } from "./runner.js";

const miniPipeline = [
  {
    stage: "tika" as const,
    operationId: "tika::tika_parse_put",
    label: "Extract text (Tika)",
  },
  {
    stage: "gotenberg" as const,
    operationId: "gotenberg::post_forms_libreoffice_convert",
    label: "Normalize PDF (Gotenberg)",
  },
];

describe("runIdpPipeline", () => {
  it("dry-runs all hops without calling execute", async () => {
    const execute = vi.fn();
    const result = await runIdpPipeline({ dry_run: true, pipeline: miniPipeline }, { execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.hops).toHaveLength(2);
    expect(result.hops[0]?.response_excerpt).toContain("dry run");
  });

  it("skips stages listed in skip_stages", async () => {
    const execute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"ok":true}' }],
    });
    const result = await runIdpPipeline(
      {
        dry_run: false,
        pipeline: miniPipeline,
        skip_stages: ["gotenberg"],
      },
      { execute }
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.hops[1]?.skipped).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("retries execute failures then succeeds", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ content: [{ type: "text", text: '{"ok":true}' }] });
    const result = await runIdpPipeline(
      {
        dry_run: false,
        pipeline: [miniPipeline[0]!],
        max_retries: 2,
      },
      { execute }
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.hops[0]?.attempts).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("halts on error when stop_on_error is true", async () => {
    const execute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"error":"bad request"}' }],
    });
    const result = await runIdpPipeline(
      {
        dry_run: false,
        pipeline: miniPipeline,
        stop_on_error: true,
        max_retries: 0,
      },
      { execute }
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.halted_at_operation_id).toBe("tika::tika_parse_put");
    expect(result.hops).toHaveLength(1);
  });

  it("invokes onHop after each hop", async () => {
    const onHop = vi.fn();
    await runIdpPipeline(
      { dry_run: true, pipeline: [miniPipeline[0]!], correlation_id: "corr-1" },
      { execute: vi.fn(), onHop }
    );
    expect(onHop).toHaveBeenCalledTimes(1);
    expect(onHop.mock.calls[0]?.[0]?.correlation_id).toBe("corr-1");
  });

  it("chains Stirling redact args from prior PDF artifact", async () => {
    const pdf = Buffer.from("%PDF-demo").toString("base64");
    const execute = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            encoding: "base64",
            data: pdf,
            contentType: "application/pdf",
          }),
        },
      ],
    });
    const pipeline = [
      {
        stage: "gotenberg" as const,
        operationId: "gotenberg::post_forms_libreoffice_convert",
        label: "Normalize PDF",
      },
      {
        stage: "stirling" as const,
        operationId: "stirling::redactPdfAuto",
        label: "Redact",
        argsTemplate: {
          fileInput: "${pdf_base64}",
          listOfText: "${redact_list}",
        },
      },
    ];
    const result = await runIdpPipeline(
      {
        dry_run: false,
        pipeline,
        redact_list: "SSN",
        max_retries: 0,
      },
      { execute }
    );
    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    const stirlingCall = execute.mock.calls[1]?.[0] as {
      operationId: string;
      args: Record<string, unknown>;
    };
    expect(stirlingCall.operationId).toBe("stirling::redactPdfAuto");
    expect(stirlingCall.args.fileInput).toBe(pdf);
    expect(stirlingCall.args.listOfText).toBe("SSN");
  });

  it("fails when Stirling redact is skipped under require flag", async () => {
    const prev = process.env.CLAWQL_IDP_REQUIRE_STIRLING_REDACT;
    process.env.CLAWQL_IDP_REQUIRE_STIRLING_REDACT = "1";
    try {
      const result = await runIdpPipeline(
        {
          dry_run: true,
          pipeline: [
            {
              stage: "stirling",
              operationId: "stirling::redactPdfAuto",
              label: "Redact",
            },
          ],
          skip_stages: ["stirling"],
        },
        { execute: vi.fn() }
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/REQUIRE_STIRLING_REDACT/i);
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_IDP_REQUIRE_STIRLING_REDACT;
      else process.env.CLAWQL_IDP_REQUIRE_STIRLING_REDACT = prev;
    }
  });
});
