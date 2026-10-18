/**
 * Interactive runtime ladder for `clawql doctor` (TTY).
 * Non-TTY / MCP startup: messaging only via resolveRuntimeLadderEffect.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import { Effect } from "effect";
import {
  CELLD_PINNED_VERSION,
  INSTALL_BUN_HINT,
  INSTALL_CELLD_HINT,
  NODE_IMPROVE_HINT,
  resolveRuntimeLadderEffect,
  type RuntimeLadderDecision,
} from "clawql-api";
import type { DoctorCheck } from "./doctor.js";

async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const rl = createInterface({ input, output });
  try {
    const hint = defaultYes ? "Y/n" : "y/N";
    const ans = (await rl.question(`${question} [${hint}] `)).trim().toLowerCase();
    if (!ans) return defaultYes;
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}

function tryInstallCelld(): boolean {
  console.log(`\n→ ${INSTALL_CELLD_HINT}\n`);
  const res = spawnSync(
    "bash",
    ["-lc", "curl -fsSL https://celld.dev/install.sh | sh"],
    {
      stdio: "inherit",
      env: { ...process.env, CELLD_VERSION: CELLD_PINNED_VERSION },
    }
  );
  return res.status === 0;
}

function tryInstallBun(): boolean {
  console.log(`\n→ ${INSTALL_BUN_HINT}\n`);
  const res = spawnSync("bash", ["-lc", "curl -fsSL https://bun.sh/install | bash"], {
    stdio: "inherit",
    env: process.env,
  });
  return res.status === 0;
}

/**
 * Run preference ladder with optional TTY install prompts.
 * Mutates a copy of env with DECLINE_* when the operator refuses.
 */
export async function runRuntimeLadderInteractive(
  env: NodeJS.ProcessEnv = process.env,
  options: { interactive?: boolean } = {}
): Promise<{ decision: RuntimeLadderDecision; env: NodeJS.ProcessEnv }> {
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
  const nextEnv: NodeJS.ProcessEnv = { ...env };

  let decision = await Effect.runPromise(resolveRuntimeLadderEffect(nextEnv));

  // Missing celld → prompt install; refuse → DECLINE_CELLD
  if (decision.tier !== "celld" && !decision.celldPresent && !decision.celldDeclined) {
    if (interactive) {
      const install = await askYesNo(
        "celld is preferred for Core isolation (CoreToolsDO). Install celld now?",
        true
      );
      if (install) {
        if (tryInstallCelld()) {
          decision = await Effect.runPromise(resolveRuntimeLadderEffect(nextEnv));
        } else {
          console.error("celld install failed — continuing ladder.");
        }
      } else {
        nextEnv.CLAWQL_DECLINE_CELLD = "1";
        console.log("Declined celld. Continuing to Bun host MCP.\n");
        decision = await Effect.runPromise(resolveRuntimeLadderEffect(nextEnv));
      }
    }
  }

  // Bun rung: missing and not declined → prompt install (after celld settled off-tier)
  if (
    decision.tier !== "celld" &&
    !decision.bunPresent &&
    !decision.bunDeclined &&
    interactive
  ) {
    const install = await askYesNo(
      "Bun is preferred for host MCP (better RSS/latency than Node). Install Bun now?",
      true
    );
    if (install) {
      if (tryInstallBun()) {
        const bunBin = `${process.env.HOME || ""}/.bun/bin`;
        if (bunBin && !String(nextEnv.PATH || "").includes(bunBin)) {
          nextEnv.PATH = `${bunBin}:${nextEnv.PATH || process.env.PATH || ""}`;
        }
        decision = await Effect.runPromise(resolveRuntimeLadderEffect(nextEnv));
      } else {
        console.error("Bun install failed — continuing to Node.");
      }
    } else {
      nextEnv.CLAWQL_DECLINE_BUN = "1";
      console.log("Declined Bun. Falling back to Node (legacy).\n");
      decision = await Effect.runPromise(resolveRuntimeLadderEffect(nextEnv));
    }
  }

  if (decision.tier === "node") {
    console.error(`\n${NODE_IMPROVE_HINT}\n`);
  }

  return { decision, env: nextEnv };
}

/** Doctor checks from a resolved ladder decision (no TTY). */
export function doctorChecksFromRuntimeLadder(
  decision: RuntimeLadderDecision
): DoctorCheck[] {
  const level =
    decision.tier === "celld" ? "ok" : decision.tier === "bun" ? "warn" : "warn";
  return [
    {
      level,
      message: `runtime ladder: ${decision.tier} (${decision.honesty})`,
      detail: decision.messages.join("\n"),
    },
  ];
}

/** Non-interactive resolve for MCP startup logging. */
export async function resolveRuntimeLadderForStartup(
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeLadderDecision> {
  return Effect.runPromise(resolveRuntimeLadderEffect(env));
}
