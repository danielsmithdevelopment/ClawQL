/**
 * `clawql network` / `clawql init --networking` CLI façade.
 */
import { Effect } from "effect";

import {
  initNetworking,
  networkDoctorCheck,
  networkStatusLines,
  type InitNetworkingOptions,
} from "clawql-network/init";

import { getClawqlHome } from "./paths.js";

export type NetworkCliInitOptions = InitNetworkingOptions & {
  readonly yes?: boolean;
};

export async function runNetworkInitCmd(opts: NetworkCliInitOptions = {}): Promise<number> {
  const home = opts.home ?? getClawqlHome();
  try {
    const result = await Effect.runPromise(initNetworking({ ...opts, home }));
    console.log("ClawQL networking init complete\n");
    console.log(`  Config:    ${result.configPath}`);
    console.log(`  Transport: ${result.transportDefault} (safe default)`);
    console.log(`  Tailcat:   gated by ATR scope ${result.tailcatScopeRequired}`);
    if (result.meshIdentity) {
      console.log(
        `  Mesh:      ${result.meshIdentity.meshAddress} (node ${result.meshIdentity.nodeId})`
      );
    }
    if (result.derpRelay) {
      console.log(
        `  DERP:      ${result.derpRelay.started ? "started" : "skipped"} (${result.derpRelay.region})`
      );
    }
    console.log("\nNext:");
    console.log("  clawql network status");
    console.log("  clawql doctor --smoke");
    console.log(
      "  For mesh enrollment with Headscale, set CLAWQL_HEADSCALE_AUTHKEY before init if needed.\n"
    );
    return 0;
  } catch (err) {
    console.error("ClawQL networking init failed:", err instanceof Error ? err.message : err);
    return 1;
  }
}

export async function runNetworkStatusCmd(home?: string): Promise<number> {
  const lines = await Effect.runPromise(networkStatusLines(home ?? getClawqlHome()));
  console.log("ClawQL networking status\n");
  for (const line of lines) console.log(`  ${line}`);
  console.log("");
  return 0;
}

export async function runNetworkVerifyCmd(home?: string): Promise<number> {
  const check = await Effect.runPromise(networkDoctorCheck(home ?? getClawqlHome()));
  console.log(check.message);
  if (check.detail) console.log(`  ${check.detail}`);
  return check.level === "fail" ? 1 : 0;
}
