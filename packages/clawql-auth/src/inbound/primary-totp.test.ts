import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createStepUpStoreLayer, generateTotpEffect } from "../step-up/index.js";
import { StepUpStoreService } from "../step-up/store.js";
import { PrimaryTotpError, primaryTotpLoginEffect } from "./primary-totp.js";

describe("primaryTotpLoginEffect", () => {
  it("returns ATR claims with mfa after successful TOTP", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-primary-totp-"));
    try {
      const layer = createStepUpStoreLayer(join(dir, "step-up.json"));
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* StepUpStoreService;
          const { enrollment } = yield* store.enroll({ subjectId: "tenant-1" });
          const code = yield* generateTotpEffect(enrollment.secretBase32);
          return yield* primaryTotpLoginEffect({
            tenantId: "tenant-1",
            code,
            role: "admin",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.sub).toBe("tenant-1");
      expect(result.role).toBe("admin");
      expect(result.mfa).toBe(true);
      expect(result.amr).toEqual(["otp"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when not enrolled or code invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-primary-totp-"));
    try {
      const layer = createStepUpStoreLayer(join(dir, "step-up.json"));
      const missing = await Effect.runPromiseExit(
        primaryTotpLoginEffect({ tenantId: "nobody", code: "000000" }).pipe(Effect.provide(layer))
      );
      expect(missing._tag).toBe("Failure");
      if (missing._tag === "Failure" && missing.cause._tag === "Fail") {
        expect((missing.cause.error as PrimaryTotpError).reason).toBe("not_enrolled");
      }

      const bad = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const store = yield* StepUpStoreService;
          yield* store.enroll({ subjectId: "tenant-2" });
          return yield* primaryTotpLoginEffect({
            tenantId: "tenant-2",
            code: "000000",
          });
        }).pipe(Effect.provide(layer))
      );
      expect(bad._tag).toBe("Failure");
      if (bad._tag === "Failure" && bad.cause._tag === "Fail") {
        expect((bad.cause.error as PrimaryTotpError).reason).toBe("invalid_code");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
