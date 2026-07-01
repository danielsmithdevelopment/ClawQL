import { afterEach, describe, expect, it } from "vitest";
import { getDefaultAuditRingBuffer, resetDefaultAuditRingBufferForTests } from "clawql-core";
import { buildSubmitWorkflowBody, mapWorkflowToSummary } from "./argo-mapper.js";
import {
  configureWorkflowK8sFactory,
  resetWorkflowK8sClientsForTests,
  type ArgoWorkflowObject,
  type WorkflowK8sClients,
} from "./k8s-client.js";

function enableWorkflowEnv(): void {
  process.env.CLAWQL_ENABLE_WORKFLOW = "1";
  process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST = "clawql";
  process.env.CLAWQL_WORKFLOW_DEFAULT_NAMESPACE = "clawql";
}

function clearWorkflowEnv(): void {
  delete process.env.CLAWQL_ENABLE_WORKFLOW;
  delete process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST;
  delete process.env.CLAWQL_WORKFLOW_DEFAULT_NAMESPACE;
  delete process.env.CLAWQL_WORKFLOW_ALLOW_DELETE;
  delete process.env.CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL;
  delete process.env.CLAWQL_WORKFLOW_NOTIFY_CHANNEL;
}

function mockClients(handlers: {
  get?: () => Promise<ArgoWorkflowObject>;
  list?: () => Promise<{ items?: ArgoWorkflowObject[] }>;
  listTemplates?: () => Promise<{ items?: { metadata?: { name?: string; namespace?: string } }[] }>;
  listClusterTemplates?: () => Promise<{ items?: { metadata?: { name?: string } }[] }>;
  create?: () => Promise<ArgoWorkflowObject>;
  delete?: () => Promise<void>;
  logs?: () => Promise<string>;
}): void {
  configureWorkflowK8sFactory(async () => {
    const clients: WorkflowK8sClients = {
      customObjects: {
        getNamespacedCustomObject: async () => {
          if (!handlers.get) throw new Error("get not mocked");
          return handlers.get();
        },
        listNamespacedCustomObject: async (params: { plural?: string }) => {
          if (params.plural === "workflowtemplates") {
            if (!handlers.listTemplates) throw new Error("listTemplates not mocked");
            return handlers.listTemplates();
          }
          if (!handlers.list) throw new Error("list not mocked");
          return handlers.list();
        },
        listClusterCustomObject: async () => {
          if (!handlers.listClusterTemplates) throw new Error("listClusterTemplates not mocked");
          return handlers.listClusterTemplates();
        },
        createNamespacedCustomObject: async () => {
          if (!handlers.create) throw new Error("create not mocked");
          return handlers.create();
        },
        deleteNamespacedCustomObject: async () => {
          if (!handlers.delete) throw new Error("delete not mocked");
          await handlers.delete();
        },
      } as never,
      coreV1: {
        readNamespacedPodLog: async () => handlers.logs?.() ?? "log line\n",
      } as never,
    };
    return clients;
  });
}

const sampleWorkflow = (phase: string): ArgoWorkflowObject => ({
  metadata: {
    name: "clawql-xyz",
    namespace: "clawql",
    labels: { "clawql.dev/correlation-id": "corr-1" },
  },
  status: {
    phase,
    nodes: {
      "1": {
        displayName: "vault-digest",
        phase,
        type: "Pod",
        podName: "clawql-xyz-vault-digest-1",
      },
    },
  },
  spec: { workflowTemplateRef: { name: "clawql-vault-daily-digest" } },
});

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
    resetDefaultAuditRingBufferForTests();
    clearWorkflowEnv();
  });

  it("returns disabled when flag off", async () => {
    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "get", name: "x" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not enabled/i);
  });

  it("submits workflow when mocked k8s client is configured", async () => {
    enableWorkflowEnv();

    const created: ArgoWorkflowObject = {
      metadata: { name: "clawql-xyz", namespace: "clawql" },
      status: { phase: "Pending" },
      spec: { workflowTemplateRef: { name: "clawql-vault-daily-digest" } },
    };

    mockClients({ create: async () => created });

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
    const audit = getDefaultAuditRingBuffer().list(5).entries;
    expect(audit.some((e) => e.action === "submit" && e.category === "workflow")).toBe(true);
  });

  it("waits until workflow reaches terminal phase", async () => {
    enableWorkflowEnv();

    let polls = 0;
    mockClients({
      get: async () => {
        polls++;
        const phase = polls < 2 ? "Running" : "Succeeded";
        return sampleWorkflow(phase);
      },
    });

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
    const audit = getDefaultAuditRingBuffer().list(5).entries;
    expect(audit.some((e) => e.action === "terminal" && e.category === "workflow")).toBe(true);
  });

  it("get appends audit when phase is terminal", async () => {
    enableWorkflowEnv();
    mockClients({ get: async () => sampleWorkflow("Succeeded") });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "get", name: "clawql-xyz" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.workflow.phase).toBe("Succeeded");
    const audit = getDefaultAuditRingBuffer().list(5).entries;
    expect(audit.some((e) => e.action === "terminal")).toBe(true);
  });

  it("get does not audit when phase is non-terminal", async () => {
    enableWorkflowEnv();
    mockClients({ get: async () => sampleWorkflow("Running") });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    await handleWorkflowToolInput({ operation: "get", name: "clawql-xyz" });
    const audit = getDefaultAuditRingBuffer().list(5).entries;
    expect(audit).toHaveLength(0);
  });

  it("lists workflows with optional phase filter", async () => {
    enableWorkflowEnv();
    mockClients({
      list: async () => ({
        items: [sampleWorkflow("Running"), sampleWorkflow("Succeeded")],
      }),
    });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({
      operation: "list",
      phase: "Succeeded",
    });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].phase).toBe("Succeeded");
  });

  it("list_templates returns namespace and cluster templates", async () => {
    enableWorkflowEnv();
    mockClients({
      listTemplates: async () => ({
        items: [{ metadata: { name: "clawql-vault-daily-digest", namespace: "clawql" } }],
      }),
      listClusterTemplates: async () => ({
        items: [{ metadata: { name: "global-digest" } }],
      }),
    });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "list_templates" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.templates).toHaveLength(2);
    expect(body.templates.map((t: { name: string }) => t.name).sort()).toEqual([
      "clawql-vault-daily-digest",
      "global-digest",
    ]);
  });

  it("rejects delete when CLAWQL_WORKFLOW_ALLOW_DELETE is off", async () => {
    enableWorkflowEnv();
    mockClients({ delete: async () => {} });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "delete", name: "clawql-xyz" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/delete is disabled/i);
  });

  it("deletes workflow when delete is allowed", async () => {
    enableWorkflowEnv();
    process.env.CLAWQL_WORKFLOW_ALLOW_DELETE = "1";
    let deleted = false;
    mockClients({
      delete: async () => {
        deleted = true;
      },
    });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "delete", name: "clawql-xyz" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(true);
    expect(deleted).toBe(true);
  });

  it("returns pod logs for a workflow node", async () => {
    enableWorkflowEnv();
    mockClients({
      get: async () => sampleWorkflow("Succeeded"),
      logs: async () => "digest complete\n",
    });

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({
      operation: "logs",
      name: "clawql-xyz",
      node_name: "vault-digest",
    });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.logs).toBe("digest complete\n");
    expect(body.pod_name).toBe("clawql-xyz-vault-digest-1");
  });

  it("rejects disallowed namespace", async () => {
    enableWorkflowEnv();
    process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST = "other-ns";

    const { handleWorkflowToolInput } = await import("./workflow.js");
    const res = await handleWorkflowToolInput({ operation: "get", name: "clawql-xyz" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not in CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST/i);
  });

  it("rejects submit without template_ref", async () => {
    enableWorkflowEnv();
    const { handleWorkflowToolInput } = await import("./workflow.js");
    await expect(handleWorkflowToolInput({ operation: "submit" })).rejects.toThrow();
  });

  it("rejects wait without name", async () => {
    enableWorkflowEnv();
    const { handleWorkflowToolInput } = await import("./workflow.js");
    await expect(handleWorkflowToolInput({ operation: "wait" })).rejects.toThrow();
  });

  it("rejects logs without node_name", async () => {
    enableWorkflowEnv();
    const { handleWorkflowToolInput } = await import("./workflow.js");
    await expect(
      handleWorkflowToolInput({ operation: "logs", name: "clawql-xyz" })
    ).rejects.toThrow();
  });
});
