import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createIssuedApiKeyStore } from "../api-keys/store.js";
import type { AuthEvent } from "../audit/auth-events.js";
import { createMemorySecretStore } from "../stores/memory.js";
import { offboardSubjectEffect } from "./offboard.js";

describe("offboardSubjectEffect", () => {
  it("revokes subject keys and marks OAuth providers for re-auth", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-offboard-"));
    try {
      const apiKeys = createIssuedApiKeyStore({ path: join(dir, "keys.json") });
      const alice = await Effect.runPromise(
        apiKeys.issue({
          subjectId: "alice",
          orgId: "acme",
          teamId: "platform",
          role: "operator",
          scope: ["execute"],
        })
      );
      await Effect.runPromise(
        apiKeys.issue({
          subjectId: "bob",
          orgId: "acme",
          role: "operator",
          scope: ["execute"],
        })
      );

      const secretStore = createMemorySecretStore();
      await Effect.runPromise(
        secretStore.setOAuthToken("google", {
          accessToken: "a",
          refreshToken: "r",
          expiresAtMs: Date.now() + 60_000,
          status: "active",
          providerId: "google",
        })
      );

      const events: AuthEvent[] = [];
      const result = await Effect.runPromise(
        offboardSubjectEffect(
          apiKeys,
          {
            orgId: "acme",
            subjectId: "alice",
            oauthProviderIds: ["google"],
          },
          {
            secretStore,
            eventSink: (e) =>
              Effect.sync(() => {
                events.push(e);
              }),
          }
        )
      );

      expect(result.revokedKeyIds).toEqual([alice.record.id]);
      expect(result.oauthMarked).toEqual(["google"]);
      const token = await Effect.runPromise(secretStore.getOAuthToken("google"));
      expect(token?.status).toBe("needs_reauth");
      expect(events.some((e) => e.type === "OAUTH_REAUTH_REQUIRED")).toBe(true);

      const active = await Effect.runPromise(apiKeys.listActive({ orgId: "acme" }));
      expect(active).toHaveLength(1);
      expect(active[0]!.subjectId).toBe("bob");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
