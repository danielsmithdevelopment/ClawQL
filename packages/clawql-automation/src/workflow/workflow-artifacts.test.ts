import { describe, expect, it } from "vitest";
import { listWorkflowArtifacts } from "./workflow-artifacts.js";
import type { ArgoWorkflowObject } from "./k8s-client.js";

describe("listWorkflowArtifacts", () => {
  it("lists artifact refs without secret keys", () => {
    const wf: ArgoWorkflowObject = {
      status: {
        nodes: {
          n1: {
            displayName: "export",
            type: "Pod",
            phase: "Succeeded",
            outputs: {
              artifacts: [
                {
                  name: "report",
                  path: "/tmp/report.json",
                  s3: { bucket: "pipelines", key: "reports/1.json", endpoint: "s3.amazonaws.com" },
                },
              ],
            },
          },
        },
      },
    } as ArgoWorkflowObject;

    const artifacts = listWorkflowArtifacts(wf);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      node_name: "export",
      artifact_name: "report",
      path: "/tmp/report.json",
      archive_location: { kind: "s3", bucket: "pipelines", key: "reports/1.json" },
    });
  });

  it("filters by node_name", () => {
    const wf: ArgoWorkflowObject = {
      status: {
        nodes: {
          a: {
            displayName: "step-a",
            outputs: { artifacts: [{ name: "a-out" }] },
          },
          b: {
            displayName: "step-b",
            outputs: { artifacts: [{ name: "b-out" }] },
          },
        },
      },
    } as ArgoWorkflowObject;
    expect(listWorkflowArtifacts(wf, "step-b")).toHaveLength(1);
    expect(listWorkflowArtifacts(wf, "step-b")[0]?.artifact_name).toBe("b-out");
  });
});
