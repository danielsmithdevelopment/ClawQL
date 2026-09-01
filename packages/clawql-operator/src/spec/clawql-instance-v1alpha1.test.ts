import { describe, expect, it } from "vitest";
import {
  clawqlInstanceSpecToHorizontalTierSpec,
  parseClawqlInstanceSpec,
} from "./clawql-instance-v1alpha1.js";

describe("ClawQLInstance spec", () => {
  it("parses horizontal tier toggles", () => {
    const spec = parseClawqlInstanceSpec({
      tier: "standard",
      memory: { enabled: true },
      ouroboros: { enabled: true, langfuseEval: { enabled: true } },
    });
    const tier = clawqlInstanceSpecToHorizontalTierSpec(spec);
    expect(tier.memory?.enabled).toBe(true);
    expect(tier.ouroboros?.langfuseEval?.enabled).toBe(true);
  });

  it("parses providers pack alongside horizontal toggles", () => {
    const spec = parseClawqlInstanceSpec({
      tier: "standard",
      providers: { pack: "default", enabled: ["n8n"] },
      memory: { enabled: true },
    });
    expect(spec.providers).toEqual({ pack: "default", enabled: ["n8n"] });
  });
});
