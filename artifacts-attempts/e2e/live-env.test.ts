import { describe, expect, it } from "vitest";
import { liveEnvReport, missingLiveEnv } from "./live-env.js";

describe("live-env", () => {
  it("reports missing Cloudflare keys", () => {
    expect(missingLiveEnv({})).toEqual(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
    expect(liveEnvReport({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" }).ready).toBe(
      true
    );
  });
});
