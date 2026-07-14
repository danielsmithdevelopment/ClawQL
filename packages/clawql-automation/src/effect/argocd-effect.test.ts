import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureArgocdK8sFactory,
  resetArgocdK8sClientsForTests,
  type ArgoCdApplicationObject,
} from "../argocd/argocd.js";
import { executeArgocdToolCoreEffect } from "./argocd-effect.js";

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

describe("executeArgocdToolCoreEffect", () => {
  afterEach(() => {
    resetArgocdK8sClientsForTests();
    clearArgocdEnv();
  });

  it("returns soft disabled JSON without nested Layer provision", async () => {
    const result = await Effect.runPromise(executeArgocdToolCoreEffect({ operation: "list" }));
    const body = JSON.parse(result.content[0]!.text) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not enabled/i);
  });

  it("lists applications via staged Effect dispatch", async () => {
    enableArgocdEnv();
    configureArgocdK8sFactory(
      async () =>
        ({
          listNamespacedCustomObject: async () => ({ items: [sampleApp()] }),
        }) as never
    );

    const result = await Effect.runPromise(executeArgocdToolCoreEffect({ operation: "list" }));
    const body = JSON.parse(result.content[0]!.text) as {
      ok?: boolean;
      applications?: Array<{ name?: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.applications).toHaveLength(1);
    expect(body.applications?.[0]?.name).toBe("guestbook");
  });

  it("soft-fails Zod validation without throwing", async () => {
    enableArgocdEnv();
    const result = await Effect.runPromise(
      executeArgocdToolCoreEffect({ operation: "get" /* missing name */ })
    );
    const body = JSON.parse(result.content[0]!.text) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/name/i);
  });
});
