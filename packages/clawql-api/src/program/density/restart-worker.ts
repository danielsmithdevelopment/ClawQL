/**
 * Child process for restart-survival: wake one bag from CLAWQL_DENSITY_BAG_DIR
 * without sharing the parent heap. Prints one JSON line on stdout.
 */

import { Effect } from "effect";
import { makeParkedBagApi, resolveBagDirEffect } from "./bag-store.js";

async function main(): Promise<void> {
  const bagDir =
    process.env.CLAWQL_DENSITY_BAG_DIR?.trim() ||
    (await Effect.runPromise(resolveBagDirEffect()));
  const agentId = process.env.CLAWQL_DENSITY_RESTART_AGENT_ID?.trim();
  if (!agentId) {
    process.stdout.write(`${JSON.stringify({ ok: false, detail: "missing agent id" })}\n`);
    process.exit(2);
  }
  const bags = makeParkedBagApi(bagDir);
  try {
    const agent = await Effect.runPromise(bags.wake(agentId));
    const ok =
      agent.agentId === agentId &&
      agent.status === "parked" &&
      agent.turns.length === 40 &&
      !!agent.pendingTool?.approvalId;
    process.stdout.write(
      `${JSON.stringify({
        ok,
        detail: ok
          ? `woke ${agentId} turns=${agent.turns.length}`
          : `shape mismatch for ${agentId}`,
      })}\n`
    );
    process.exit(ok ? 0 : 1);
  } catch (err) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      })}\n`
    );
    process.exit(1);
  }
}

void main();
