/**
 * Optional live-cluster integration tests for the workflow tool.
 * Run when CLAWQL_ARGO_WORKFLOWS_INTEGRATION=1 and kubeconfig can reach Argo Workflows ≥ 3.4.0.
 */

import { afterAll, describe, expect, it } from "vitest";
import { handleWorkflowToolInput } from "./workflow.js";
import { resetWorkflowK8sClientsForTests } from "./k8s-client.js";

const enabled = process.env.CLAWQL_ARGO_WORKFLOWS_INTEGRATION === "1";

describe.skipIf(!enabled)("workflow integration (live cluster)", () => {
  afterAll(() => {
    resetWorkflowK8sClientsForTests();
  });

  it("list_templates returns at least zero templates in allowlisted namespace", async () => {
    const res = await handleWorkflowToolInput({ operation: "list_templates" });
    const body = JSON.parse(res.content[0]!.text) as { ok: boolean; templates?: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.templates)).toBe(true);
  });
});
