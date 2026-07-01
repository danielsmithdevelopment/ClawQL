import { afterEach, describe, expect, it } from "vitest";
import { buildSubmitWorkflowBody, mapWorkflowToSummary } from "./argo-mapper.js";
import {
  configureWorkflowK8sFactory,
  resetWorkflowK8sClientsForTests,
  type ArgoWorkflowObject,
} from "./k8s-client.js";

describe("buildSubmitWorkflowBody", () => {
  it("builds template-ref workflow with managed labels", () => {
    const body = buildSubmitWorkflowBody({
      generateName: "clawql-",
      namespace: "pipelines",
      templateRef: { kind: "WorkflowTemplate", name: "digest", namespace: "pipelines" },
      parameters: { hours_back: "24" },
      correlationId: "run-1",
    });
    expect(body).toMatchObject({
      kind: "Workflow",
      metadata: {
        generateName: "clawql-",
        namespace: "pipelines",
        labels: {
          "clawql.dev/managed": "true",
          "clawql.dev/correlation-id": "run-1",
        },
      },
      spec: {
        workflowTemplateRef: { name: "digest" },
        arguments: { parameters: [{ name: "hours_back", value: "24" }] },
      },
    });
  });

  it("sets clusterScope for ClusterWorkflowTemplate", () => {
    const body = buildSubmitWorkflowBody({
      generateName: "clawql-",
      namespace: "pipelines",
      templateRef: { kind: "ClusterWorkflowTemplate", name: "global-digest" },
    });
    expect(body.spec).toMatchObject({
      workflowTemplateRef: { name: "global-digest", clusterScope: true },
    });
  });
});

describe("mapWorkflowToSummary", () => {
  it("maps phase and nodes", () => {
    const wf: ArgoWorkflowObject = {
      metadata: { name: "clawql-abc", namespace: "pipelines", uid: "uid-1" },
      spec: {
        workflowTemplateRef: { name: "digest" },
        arguments: { parameters: [{ name: "hours_back", value: "24" }] },
      },
      status: {
        phase: "Running",
        startedAt: "2026-06-30T00:00:00Z",
        nodes: {
          "1": {
            displayName: "vault-digest",
            phase: "Running",
            type: "Pod",
            podName: "clawql-abc-vault-digest-123",
          },
        },
      },
    };
    const summary = mapWorkflowToSummary(wf, "pipelines");
    expect(summary.phase).toBe("Running");
    expect(summary.template_ref).toEqual({
      kind: "WorkflowTemplate",
      name: "digest",
      namespace: "pipelines",
    });
    expect(summary.parameters).toEqual({ hours_back: "24" });
    expect(summary.nodes?.[0]?.pod_name).toBe("clawql-abc-vault-digest-123");
  });
});

describe("handleWorkflowToolInput", () => {
  afterEach(() => {
    resetWorkflowK8sClientsForTests();
    delete process.env.CLAWQL_ENABLE_WORKFLOW;
    delete process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST;
    delete process.env.CLAWQL_WORKFLOW_DEFAULT_NAMESPACE;
  });

  it("returns disabled when flag off", async () => {
    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "get", name: "x" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not enabled/i);
  });

  it("submits workflow when mocked k8s client is configured", async () => {
    process.env.CLAWQL_ENABLE_WORKFLOW = "1";
    process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST = "clawql";
    process.env.CLAWQL_WORKFLOW_DEFAULT_NAMESPACE = "clawql";

    const created: ArgoWorkflowObject = {
      metadata: { name: "clawql-xyz", namespace: "clawql" },
      status: { phase: "Pending" },
      spec: { workflowTemplateRef: { name: "clawql-vault-daily-digest" } },
    };

    configureWorkflowK8sFactory(async () => ({
      customObjects: {
        createNamespacedCustomObject: async () => created,
      } as never,
      coreV1: {} as never,
    }));

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({
      operation: "submit",
      template_ref: {
        kind: "WorkflowTemplate",
        name: "clawql-vault-daily-digest",
        namespace: "clawql",
      },
      parameters: { hours_back: "24" },
    });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.workflow.name).toBe("clawql-xyz");
  });

  it("waits until workflow reaches terminal phase", async () => {
    process.env.CLAWQL_ENABLE_WORKFLOW = "1";
    process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST = "clawql";
    process.env.CLAWQL_WORKFLOW_DEFAULT_NAMESPACE = "clawql";

    let polls = 0;
    configureWorkflowK8sFactory(async () => ({
      customObjects: {
        getNamespacedCustomObject: async () => {
          polls++;
          const phase = polls < 2 ? "Running" : "Succeeded";
          return {
            metadata: { name: "clawql-xyz", namespace: "clawql" },
            status: { phase },
            spec: { workflowTemplateRef: { name: "clawql-vault-daily-digest" } },
          } satisfies ArgoWorkflowObject;
        },
      } as never,
      coreV1: {} as never,
    }));

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({
      operation: "wait",
      name: "clawql-xyz",
      timeout_seconds: 30,
      poll_interval_seconds: 1,
    });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.operation).toBe("wait");
    expect(body.workflow.phase).toBe("Succeeded");
    expect(body.timed_out).toBe(false);
    expect(body.polls).toBe(2);
  });
});
