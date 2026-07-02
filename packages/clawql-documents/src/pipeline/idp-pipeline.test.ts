import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
  it("DEFAULT_IDP_PIPELINE includes nextcloud and coneshare", () => {
    const stages = DEFAULT_IDP_PIPELINE.map((s) => s.stage);
    expect(stages).toContain("nextcloud");
    expect(stages).toContain("coneshare");
    expect(stages).toContain("paperless");
    expect(stages).toContain("docling");
  });

  it("pipelineStepsForDashboard marks progress", () => {
    const steps = pipelineStepsForDashboard(DEFAULT_IDP_PIPELINE.slice(0, 3), 1);
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("active");
    expect(steps[2].state).toBe("pending");
  });

  it("idpStageFromOperationId parses merged ids", () => {
    expect(idpStageFromOperationId("nextcloud::nextcloud_webdav_upload")).toBe("nextcloud");
    expect(idpStageFromOperationId("coneshare::coneshare_share_links_create")).toBe("coneshare");
    expect(idpStageFromOperationId("docling::docling_convert_source")).toBe("docling");
    expect(idpStageFromOperationId("tika::tika_parse_put")).toBe("tika");
  });

  it("DEFAULT_IDP_PIPELINE operationIds exist in bundled specs", () => {
    for (const step of DEFAULT_IDP_PIPELINE) {
      expect(specContainsOperation(step.stage, step.operationId)).toBe(true);
    }
  });
});
