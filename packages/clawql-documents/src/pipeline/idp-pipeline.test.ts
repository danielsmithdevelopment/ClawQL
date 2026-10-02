import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { IdpPipelineStep } from "./idp-pipeline.js";
import {
  DEFAULT_IDP_PIPELINE,
  idpStageFromOperationId,
  pipelineStepsForDashboard,
} from "./idp-pipeline.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function bareOperationId(merged: string): string {
  return merged.includes("::") ? merged.split("::")[1]! : merged;
}

function specContainsOperation(provider: string, mergedOpId: string): boolean {
  const bare = bareOperationId(mergedOpId);
  const specPath = join(repoRoot, `providers/${provider}/openapi.yaml`);
  const text = readFileSync(specPath, "utf8");
  if (text.includes(`operationId: ${bare}`)) return true;
  // Gotenberg derives ids from path when operationId is absent
  if (provider === "gotenberg" && bare === "post_forms_libreoffice_convert") {
    return text.includes("/forms/libreoffice/convert");
  }
  return false;
}

describe("idp-pipeline", () => {
  it("DEFAULT_IDP_PIPELINE is Docling-centric: nextcloud + docling + archive/collab hops only", () => {
    const stages = DEFAULT_IDP_PIPELINE.map((s) => s.stage);
    expect(stages).toContain("nextcloud");
    expect(stages).toContain("coneshare");
    expect(stages).toContain("paperless");
    expect(stages).toContain("docling");
  });

  it("DEFAULT_IDP_PIPELINE drops opt-in-only JVM/LibreOffice converters (8.0 cut)", () => {
    const stages = DEFAULT_IDP_PIPELINE.map((s) => s.stage);
    expect(stages).not.toContain("tika");
    expect(stages).not.toContain("gotenberg");
    expect(stages).not.toContain("stirling");
  });

  it("pipelineStepsForDashboard marks progress", () => {
    const steps = pipelineStepsForDashboard(DEFAULT_IDP_PIPELINE.slice(0, 3), 1);
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("active");
    expect(steps[2].state).toBe("pending");
  });

  it("idpStageFromOperationId still recognizes opt-in converter stages (custom pipeline overrides)", () => {
    expect(idpStageFromOperationId("nextcloud::nextcloud_webdav_upload")).toBe("nextcloud");
    expect(idpStageFromOperationId("coneshare::coneshare_share_links_create")).toBe("coneshare");
    expect(idpStageFromOperationId("docling::docling_convert_source")).toBe("docling");
    // Tika/Gotenberg/Stirling are gone from DEFAULT_IDP_PIPELINE but the stage type + lookup still
    // support them for operators who opt in via a custom `pipeline` override on `run_idp_pipeline`.
    expect(idpStageFromOperationId("tika::tika_parse_put")).toBe("tika");
    expect(idpStageFromOperationId("gotenberg::post_forms_libreoffice_convert")).toBe("gotenberg");
    expect(idpStageFromOperationId("stirling::redactPdfAuto")).toBe("stirling");
  });

  it("supports a custom pipeline override that reinstates opt-in converter stages", () => {
    const customPipeline: IdpPipelineStep[] = [
      ...DEFAULT_IDP_PIPELINE.slice(0, 2),
      {
        stage: "tika",
        operationId: "tika::tika_parse_put",
        label: "Extract text (Tika)",
      },
      {
        stage: "gotenberg",
        operationId: "gotenberg::post_forms_libreoffice_convert",
        label: "Normalize PDF (Gotenberg)",
      },
      {
        stage: "stirling",
        operationId: "stirling::redactPdfAuto",
        label: "Redact PII (Stirling)",
      },
    ];
    const stages = customPipeline.map((s) => s.stage);
    expect(stages).toEqual(["nextcloud", "docling", "tika", "gotenberg", "stirling"]);
    for (const step of customPipeline) {
      expect(specContainsOperation(step.stage, step.operationId)).toBe(true);
    }
  });

  it("DEFAULT_IDP_PIPELINE operationIds exist in bundled specs", () => {
    for (const step of DEFAULT_IDP_PIPELINE) {
      expect(specContainsOperation(step.stage, step.operationId)).toBe(true);
    }
  });
});
