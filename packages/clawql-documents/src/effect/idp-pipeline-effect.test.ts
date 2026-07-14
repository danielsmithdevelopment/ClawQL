import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { runIdpPipelineEffect } from "./idp-pipeline-effect.js";

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

describe("runIdpPipelineEffect", () => {
  it("stages dry-run hops without nested Layer provision", async () => {
    const execute = vi.fn();
    const result = await Effect.runPromise(
      runIdpPipelineEffect({ dry_run: true, pipeline: miniPipeline }, { execute })
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.hops).toHaveLength(2);
    expect(result.hops[0]?.response_excerpt).toContain("dry run");
  });

  it("retries execute failures then succeeds", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ content: [{ type: "text", text: '{"ok":true}' }] });
    const result = await Effect.runPromise(
      runIdpPipelineEffect(
        {
          dry_run: false,
          pipeline: [miniPipeline[0]!],
          max_retries: 2,
        },
        { execute }
      )
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.hops[0]?.attempts).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("halts on error when stop_on_error is true", async () => {
    const execute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"error":"bad request"}' }],
    });
    const result = await Effect.runPromise(
      runIdpPipelineEffect(
        {
          dry_run: false,
          pipeline: miniPipeline,
          stop_on_error: true,
          max_retries: 0,
        },
        { execute }
      )
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.halted_at_operation_id).toBe("tika::tika_parse_put");
    expect(result.hops).toHaveLength(1);
  });
});
