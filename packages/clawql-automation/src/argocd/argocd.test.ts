import { afterEach, describe, expect, it } from "vitest";
import {
  configureArgocdK8sFactory,
  handleArgocdToolInput,
  mapApplicationToSummary,
  resetArgocdK8sClientsForTests,
  type ArgoCdApplicationObject,
} from "./argocd.js";

function enableArgocdEnv(): void {
  process.env.CLAWQL_ENABLE_ARGO_CD = "1";
  process.env.CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST = "argocd";
  process.env.CLAWQL_ARGO_CD_DEFAULT_NAMESPACE = "argocd";
}

function clearArgocdEnv(): void {
  delete process.env.CLAWQL_ENABLE_ARGO_CD;
  delete process.env.CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST;
  delete process.env.CLAWQL_ARGO_CD_DEFAULT_NAMESPACE;
  delete process.env.CLAWQL_ARGO_CD_ALLOW_SYNC;
}

const sampleApp = (): ArgoCdApplicationObject => ({
  metadata: { name: "guestbook", namespace: "argocd" },
  spec: {
    project: "default",
    source: {
      repoURL: "https://github.com/example/guestbook",
      path: "k8s",
      targetRevision: "main",
    },
    destination: { namespace: "guestbook", server: "https://kubernetes.default.svc" },
  },
  status: { sync: { status: "Synced", revision: "abc" }, health: { status: "Healthy" } },
});

describe("mapApplicationToSummary", () => {
  it("maps sync and health", () => {
    const summary = mapApplicationToSummary(sampleApp(), "argocd");
    expect(summary.sync_status).toBe("Synced");
    expect(summary.health_status).toBe("Healthy");
    expect(summary.source?.repo_url).toContain("guestbook");
  });
});

describe("handleArgocdToolInput", () => {
  afterEach(() => {
    resetArgocdK8sClientsForTests();
    clearArgocdEnv();
  });

  it("returns disabled when flag off", async () => {
    const res = await handleArgocdToolInput({ operation: "list" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(false);
  });

  it("lists applications", async () => {
    enableArgocdEnv();
    configureArgocdK8sFactory(
      async () =>
        ({
          listNamespacedCustomObject: async () => ({ items: [sampleApp()] }),
        }) as never
    );

    const res = await handleArgocdToolInput({ operation: "list" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].name).toBe("guestbook");
  });

  it("rejects sync when not allowed", async () => {
    enableArgocdEnv();
    configureArgocdK8sFactory(
      async () =>
        ({
          getNamespacedCustomObject: async () => sampleApp(),
        }) as never
    );

    const res = await handleArgocdToolInput({ operation: "sync", name: "guestbook" });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/sync is disabled/i);
  });
});
