import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { name, UserId } from "clawql-gdp";
import { createIssuedApiKeyStore } from "../api-keys/store.js";
import { recentSignInEffect } from "../proofs/recent-sign-in.js";
import { deleteAccountEffect } from "./delete-account.js";

describe("deleteAccountEffect", () => {
  it("demands RecentSignIn and offboards the named user", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-delete-account-"));
    try {
      const apiKeys = createIssuedApiKeyStore({ path: join(dir, "keys.json") });
      await Effect.runPromise(
        apiKeys.issue({
          subjectId: "user-1",
          orgId: "org-1",
          role: "operator",
          scope: ["execute"],
        })
      );

      const result = await Effect.runPromise(
        name(UserId("user-1"), (user) =>
          Effect.gen(function* () {
            const proof = yield* recentSignInEffect(user, {
              subjectId: "user-1",
              authenticatedAt: new Date().toISOString(),
              maxAgeSeconds: 300,
            });
            expect(proof).not.toBeNull();
            return yield* deleteAccountEffect(user, proof!, apiKeys, {
              orgId: "org-1",
              subjectId: "user-1",
            });
          })
        )
      );

      expect(result.revokedKeyIds.length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects when named user mismatches subjectId", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-delete-account-mismatch-"));
    try {
      const apiKeys = createIssuedApiKeyStore({ path: join(dir, "keys.json") });
      await expect(
        Effect.runPromise(
          name(UserId("user-1"), (user) =>
            Effect.gen(function* () {
              const proof = yield* recentSignInEffect(user, {
                subjectId: "user-1",
                authenticatedAt: new Date().toISOString(),
              });
              return yield* deleteAccountEffect(user, proof!, apiKeys, {
                orgId: "org-1",
                subjectId: "user-other",
              });
            })
          )
        )
      ).rejects.toMatchObject({
        reason: expect.stringContaining("does not match"),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
