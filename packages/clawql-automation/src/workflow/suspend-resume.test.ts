import { describe, expect, it } from "vitest";
import {
  isActiveSuspendNode,
  nodeMatchesFieldSelector,
  parseHitlWorkflowRef,
} from "./suspend-resume.js";
import type { ArgoWorkflowNodeStatus } from "./k8s-client.js";

describe("isActiveSuspendNode", () => {
  it("matches Suspend type in Running phase", () => {
    expect(isActiveSuspendNode({ type: "Suspend", phase: "Running" })).toBe(true);
    expect(isActiveSuspendNode({ type: "Suspend", phase: "Succeeded" })).toBe(false);
    expect(isActiveSuspendNode({ type: "Pod", phase: "Running" })).toBe(false);
  });
});

describe("nodeMatchesFieldSelector", () => {
  const node: ArgoWorkflowNodeStatus = {
    displayName: "approve",
    name: "suspend-template-approve",
    phase: "Running",
    type: "Suspend",
    templateName: "approve",
    inputs: { parameters: [{ name: "doc_id", value: "42" }] },
  };

  it("matches displayName", () => {
    expect(nodeMatchesFieldSelector("displayName=approve", node, "n1")).toBe(true);
    expect(nodeMatchesFieldSelector("displayName=other", node, "n1")).toBe(false);
  });

  it("matches inputs.parameters value", () => {
    expect(nodeMatchesFieldSelector("inputs.parameters.doc_id.value=42", node, "n1")).toBe(true);
  });

  it("requires all comma-separated clauses", () => {
    expect(nodeMatchesFieldSelector("displayName=approve,phase=Running", node, "n1")).toBe(true);
    expect(nodeMatchesFieldSelector("displayName=approve,phase=Succeeded", node, "n1")).toBe(
      false
    );
  });
});

describe("parseHitlWorkflowRef", () => {
  it("reads workflow object on clawql_hitl", () => {
    expect(
      parseHitlWorkflowRef({
        workflow: { namespace: "clawql", name: "wf-1", node_field_selector: "displayName=approve" },
      })
    ).toEqual({
      namespace: "clawql",
      name: "wf-1",
      node_field_selector: "displayName=approve",
    });
  });

  it("reads provenance workflow_namespace and workflow_name", () => {
    expect(
      parseHitlWorkflowRef({
        provenance: { workflow_namespace: "pipelines", workflow_name: "hitl-run" },
      })
    ).toEqual({ namespace: "pipelines", name: "hitl-run" });
  });

  it("returns undefined when no workflow ref", () => {
    expect(parseHitlWorkflowRef({ correlation_id: "x" })).toBeUndefined();
  });
});
