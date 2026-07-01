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
});
