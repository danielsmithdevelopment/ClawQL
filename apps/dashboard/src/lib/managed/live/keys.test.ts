import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { issueManagedKeyEffect, listManagedKeysEffect, mapIssuedKeyToUi } from "./keys";

describe("managed keys live layer", () => {
  it("maps issued records into UI rows", () => {
    expect(
      mapIssuedKeyToUi({
        id: "key_1",
        label: "billing-sync",
        teamId: "Operations",
        scope: ["execute", "search", "memory"],
        expiresAt: "2027-01-03T00:00:00.000Z",
      }),
    ).toMatchObject({
      id: "key_1",
      name: "billing-sync",
      keyGroup: "Operations",
      canUse: "Tools, Memory",
    });
  });

  it("issues and lists keys against a temp store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawql-managed-keys-"));
    const env = {
      CLAWQL_MANAGED_DATA_SOURCE: "live",
      CLAWQL_HOME: dir,
      CLAWQL_MANAGED_ORG_ID: "org_test",
    };

    const issued = await Effect.runPromise(
      issueManagedKeyEffect({
        name: "ci-bot",
        subjectId: "user_ci",
        scope: ["execute", "search"],
        env,
      }),
    );
    expect(issued.secret.length).toBeGreaterThan(10);
    expect(issued.key.name).toBe("ci-bot");
    expect(issued.source).toBe("live");

    const listed = await Effect.runPromise(listManagedKeysEffect(env));
    expect(listed.source).toBe("live");
    expect(listed.keys.some((k) => k.id === issued.key.id)).toBe(true);
  });

  it("refuses issue when source is fixture", async () => {
    const exit = await Effect.runPromiseExit(
      issueManagedKeyEffect({
        name: "blocked",
        subjectId: "user_ci",
        env: { CLAWQL_MANAGED_DATA_SOURCE: "fixture" },
      }),
    );
    expect(exit._tag).toBe("Failure");
  });
});
