/**
 * Live peer arms: real local Golem server + real @earendil-works/pi-durable.
 *
 * Enable with DURABILITY_COMPARISON_LIVE_PEERS=1 (requires golem server + Node ≥24
 * for the Golem fixture build/deploy). Without that env, arms stay pending_invite.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  Type,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
} from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Effect } from "effect";
import type {
  ArmId,
  ArmModeResult,
  ArmResult,
  ComparisonTrial,
  DurabilityArm,
  UpstreamMode,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// durability-comparison → program → src → clawql-api → packages → repo root
const REPO_ROOT = join(HERE, "../../../../..");
const GOLEM_FIXTURE = join(
  REPO_ROOT,
  "scripts/benchmarks/durability-comparison/peers/golem-write-pilot"
);

function livePeersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DURABILITY_COMPARISON_LIVE_PEERS === "1";
}

function golemBin(env: NodeJS.ProcessEnv = process.env): string {
  return env.GOLEM_BIN?.trim() || "golem";
}

function summarizeMode(
  upstreamMode: UpstreamMode,
  trials: readonly ComparisonTrial[]
): ArmModeResult {
  const n = trials.length;
  const duplicates = trials.reduce((s, t) => s + t.duplicates, 0);
  const outcomeUnknown = trials.reduce((s, t) => s + t.outcomeUnknown, 0);
  const lost = trials.reduce((s, t) => s + t.lost, 0);
  const uniqueWriteEffects = trials.reduce((s, t) => s + t.uniqueWriteEffects, 0);
  const trialsOk = trials.filter((t) => t.ok).length;
  return {
    upstreamMode,
    n,
    duplicates,
    outcomeUnknown,
    lost,
    uniqueWriteEffects,
    trialsOk,
    trialsFailed: n - trialsOk,
    harnessValid: n - trialsOk === 0,
    trials: n <= 100 ? trials : trials.filter((t) => !t.ok).slice(0, 20),
  };
}

function pendingArm(id: ArmId, honesty: string): DurabilityArm {
  return {
    id,
    run: () =>
      Effect.succeed({
        armId: id,
        status: "pending_invite",
        honesty,
        modes: [],
      } satisfies ArmResult),
  };
}

// --- Mock ledger (shared) ----------------------------------------------------

type LedgerState = {
  readonly effects: Array<{ effectId: string; key: string; mode: string }>;
  seenIdem: Set<string>;
  once: number;
};

function startLedger(port = 0): Promise<{
  server: Server;
  state: LedgerState;
  url: string;
}> {
  const state: LedgerState = { effects: [], seenIdem: new Set(), once: 0 };
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/effects") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ effects: state.effects, count: state.effects.length }));
      return;
    }
    if (req.method === "POST" && req.url === "/charge") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      void Buffer.concat(chunks);
      const mode = String(req.headers["x-upstream-mode"] || "non_idempotent");
      const key = String(req.headers["idempotency-key"] || "");
      const holdMs = Math.min(60_000, Math.max(0, Number(req.headers["x-hold-ms"] || 0) || 0));
      let effectId: string;
      let applied = true;
      if (mode === "idempotent") {
        effectId = `idem:${key}`;
        if (state.seenIdem.has(effectId)) applied = false;
        else state.seenIdem.add(effectId);
      } else {
        state.once += 1;
        effectId = `once:${state.once}`;
      }
      // Apply before hold so mid-flight crash still observes the first effect.
      if (applied) state.effects.push({ effectId, key, mode });
      if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, effectId, applied }));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      resolve({ server, state, url: `http://127.0.0.1:${bound}/charge` });
    });
    server.on("error", reject);
  });
}

async function waitForEffects(base: string, min: number, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base.replace(/\/charge$/, "")}/effects`);
      const j = (await r.json()) as { count: number };
      if (j.count >= min) return j.count;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${min} ledger effects`);
}

// --- Golem live arm ----------------------------------------------------------

function runGolem(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): { status: number | null; stdout: string; stderr: string } {
  const bin = golemBin(env);
  const res = spawnSync(bin, ["-L", "-Y", ...args], {
    cwd,
    env: {
      ...env,
      PATH: env.PATH,
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

function golemFailed(output: string): boolean {
  return /\berror:\s/i.test(output) || /Argument parse error/i.test(output);
}

async function oneGolemTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly env: NodeJS.ProcessEnv;
}): Promise<ComparisonTrial> {
  const ledger = await startLedger(0);
  const trialId = `g${input.i}-${Date.now().toString(36)}`;
  const key = `key-${trialId}`;
  const holdMs = 5000;
  let invokeChild: ChildProcess | null = null;
  try {
    // Invoke must stay in-flight during simulate-crash. spawnSync would wait out the hold.
    const bin = golemBin(input.env);
    let invokeOut = "";
    let spawnErr: Error | null = null;
    invokeChild = spawn(
      bin,
      [
        "-L",
        "-Y",
        "agent",
        "invoke",
        "-t",
        `WriteAgent("${trialId}")`,
        "charge",
        // Golem CLI expects Rib string/enum literals, including quote characters.
        `"${ledger.url}"`,
        `"${key}"`,
        `"${input.upstreamMode}"`,
        String(holdMs),
      ],
      {
        cwd: GOLEM_FIXTURE,
        env: {
          ...input.env,
          PATH: `${dirname(bin)}:${input.env.PATH || process.env.PATH || ""}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    invokeChild.on("error", (err) => {
      spawnErr = err instanceof Error ? err : new Error(String(err));
      invokeOut += `\nspawn_error:${spawnErr.message}`;
    });
    invokeChild.stdout?.on("data", (c) => {
      invokeOut += String(c);
    });
    invokeChild.stderr?.on("data", (c) => {
      invokeOut += String(c);
    });

    try {
      await waitForEffects(ledger.url, 1, 15_000);
    } catch (e) {
      if (invokeChild.pid) {
        try {
          process.kill(invokeChild.pid, "SIGTERM");
        } catch {
          /* ignore */
        }
      }
      return {
        i: input.i,
        ok: false,
        duplicates: 0,
        outcomeUnknown: 0,
        lost: 0,
        uniqueWriteEffects: 0,
        childSignal: null,
        detail: `golem trigger failed: ${String(e).slice(0, 120)} out=${invokeOut.slice(0, 160)}`,
      };
    }

    const crash = runGolem(
      ["agent", "simulate-crash", `WriteAgent("${trialId}")`, "-F", "json"],
      GOLEM_FIXTURE,
      input.env
    );
    const crashText = `${crash.stdout}\n${crash.stderr}`;
    if (crash.status !== 0 || golemFailed(crashText)) {
      return {
        i: input.i,
        ok: false,
        duplicates: 0,
        outcomeUnknown: 0,
        lost: 0,
        uniqueWriteEffects: ledger.state.effects.length,
        childSignal: null,
        detail: `golem crash failed: ${crashText.slice(0, 200)}`,
      };
    }

    // Recovery re-send: non_idempotent expects a second unique effect.
    const want = input.upstreamMode === "idempotent" ? 1 : 2;
    try {
      await waitForEffects(ledger.url, want, 20_000);
    } catch {
      /* fall through to ok check with whatever landed */
    }
    await new Promise<void>((resolve) => {
      if (!invokeChild || invokeChild.exitCode !== null || invokeChild.signalCode) resolve();
      else invokeChild.once("exit", () => resolve());
      setTimeout(resolve, 3_000);
    });

    const uniqueWriteEffects = new Set(ledger.state.effects.map((e) => e.effectId)).size;
    const requestCount = ledger.state.effects.length;
    // Board "duplicates" = extra effects beyond the first (same as Pi / ClawQL arms).
    const duplicates = Math.max(0, uniqueWriteEffects - 1);
    const ok =
      input.upstreamMode === "idempotent"
        ? uniqueWriteEffects === 1 && requestCount >= 1
        : uniqueWriteEffects === 2 && requestCount === 2;
    return {
      i: input.i,
      ok,
      duplicates,
      outcomeUnknown: 0,
      lost: 0,
      uniqueWriteEffects,
      childSignal: "SIMULATE_CRASH",
      detail: ok
        ? `golem/${input.upstreamMode}: requests=${requestCount} unique=${uniqueWriteEffects}`
        : `fail golem/${input.upstreamMode}: requests=${requestCount} unique=${uniqueWriteEffects} out=${invokeOut.slice(0, 80)}`,
    };
  } finally {
    if (invokeChild?.pid) {
      try {
        process.kill(invokeChild.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve) => ledger.server.close(() => resolve()));
  }
}

function makeGolemLiveArm(): DurabilityArm {
  const pending = pendingArm(
    "golem",
    "Set DURABILITY_COMPARISON_LIVE_PEERS=1 with local `golem server run` + deployed WriteAgent fixture for live measurement."
  );
  return {
    id: "golem",
    run: ({ n }) => {
      if (!livePeersEnabled()) return pending.run({ n });
      return Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials: ComparisonTrial[] = [];
            for (let i = 0; i < n; i++) {
              trials.push(await oneGolemTrial({ i, upstreamMode, env: process.env }));
            }
            modes.push(summarizeMode(upstreamMode, trials));
          }
          return {
            armId: "golem",
            status: "measured",
            config: "golem-cli 1.6.2; @golemcloud/golem-ts-sdk@2.0.2; WriteAgent + simulate-crash mid-hold",
            honesty:
              "Live local Golem server (crash during outside write): WriteAgent fetch mid-flight + `golem agent simulate-crash`. Recovery re-sends outbound HTTP; idempotent upstream masks duplicates.",
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie);
    },
  };
}

// --- Pi Durable live arm -----------------------------------------------------

async function onePiTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
}): Promise<ComparisonTrial> {
  const dir = await mkdtemp(join(tmpdir(), "pi-durable-peer-"));
  const dbPath = join(dir, "session.sqlite");
  const signalPath = join(dir, "effect.ready");
  const effectsPath = join(dir, "effects.json");
  const taskIdPath = join(dir, "task.id");

  const child: ChildProcess = spawn(
    process.execPath,
    ["--import", "tsx", join(HERE, "pi-durable-kill-worker.ts")],
    {
      env: {
        ...process.env,
        PI_DB_PATH: dbPath,
        PI_SIGNAL_PATH: signalPath,
        PI_EFFECTS_PATH: effectsPath,
        PI_TASK_ID_PATH: taskIdPath,
        PI_HOLD_MS: "3000",
      },
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  let stderr = "";
  child.stderr?.on("data", (c) => {
    stderr += String(c);
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await readFile(signalPath, "utf8");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  if (child.pid && !child.killed) {
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      /* already exited */
    }
  }
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode) resolve();
    else child.on("exit", () => resolve());
  });

  const context = BACKGROUND_CONTEXT;
  const effectsBefore = JSON.parse(
    await readFile(effectsPath, "utf8").catch(() => "[]")
  ) as string[];

  // Reopen with the same tool definition. Faux model only finishes the turn;
  // it must not re-issue peer.charge (that would be our stand-in, not Pi).
  const Charge = defineTool({
    name: "peer.charge",
    description: "Apply one outside write (resume path — must not re-run after unsafe interrupt)",
    parameters: Type.Object({
      effectsPath: Type.String(),
      signalPath: Type.String(),
      holdMs: Type.Number(),
    }),
    replay: "unsafe",
    execute: async (args) => {
      const list = JSON.parse(
        await readFile(args.effectsPath, "utf8").catch(() => "[]")
      ) as string[];
      list.push(`effect-${list.length + 1}`);
      await writeFile(effectsPath, JSON.stringify(list), "utf8");
      return { output: [{ type: "text" as const, text: "charged-resume" }] };
    },
  });
  const ext = defineExtension({ name: "peer", tools: [Charge] });
  const registry = createRegistry();
  registry.install(ext);
  const faux = fauxProvider({ models: [{ id: "peer-test", name: "peer-test" }] });
  faux.setResponses([fauxAssistantMessage([fauxText("done after interrupt")], { stopReason: "stop" })]);
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = await Harness.open(
    await openNodeSqliteStorage(dbPath),
    { models, registry, settings: { extensions: [ext] } },
    context
  );
  await harness.root(context, {
    agent: {
      model: { provider: "faux", modelId: "peer-test" },
      extensions: [ext],
      tools: [Charge],
    },
  });
  harness.resume();
  // Let ToolTask recovery settle (interrupted, no re-execute) and any follow-up generation finish.
  const settleDeadline = Date.now() + 10_000;
  while (Date.now() < settleDeadline) {
    const snap = await harness.inspect(context);
    const live = snap.tasks.some(
      (t) => t.state.kind === "ready" || t.state.kind === "running"
    );
    if (!live) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 200));
  const effectsAfter = JSON.parse(
    await readFile(effectsPath, "utf8").catch(() => "[]")
  ) as string[];
  await harness.close(context);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);

  const uniqueWriteEffects = effectsAfter.length;
  const duplicates = Math.max(0, uniqueWriteEffects - 1);
  // Both upstream modes: unsafe tool → interrupted, no automatic re-execute → 1 effect.
  const ok = effectsBefore.length >= 1 && uniqueWriteEffects === 1 && duplicates === 0;

  return {
    i: input.i,
    ok,
    duplicates,
    outcomeUnknown: 0,
    lost: 0,
    uniqueWriteEffects,
    childSignal: "SIGKILL",
    detail: ok
      ? `pi-durable/${input.upstreamMode}: replay=unsafe interrupted; before=${effectsBefore.length} after=${uniqueWriteEffects}`
      : `fail pi-durable/${input.upstreamMode}: before=${effectsBefore.length} after=${uniqueWriteEffects} stderr=${stderr.slice(0, 120)}`,
  };
}

function makePiLiveArm(): DurabilityArm {
  const pending = pendingArm(
    "pi-durable",
    "Set DURABILITY_COMPARISON_LIVE_PEERS=1 to measure real @earendil-works/pi-durable crash→resume."
  );
  return {
    id: "pi-durable",
    run: ({ n }) => {
      if (!livePeersEnabled()) return pending.run({ n });
      return Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials: ComparisonTrial[] = [];
            for (let i = 0; i < n; i++) {
              trials.push(await onePiTrial({ i, upstreamMode }));
            }
            modes.push(summarizeMode(upstreamMode, trials));
          }
          return {
            armId: "pi-durable",
            status: "measured",
            honesty:
              "Live @earendil-works/pi-durable@1.4.0: tool peer.charge replay=unsafe; faux model issues one call; SIGKILL mid-execute; resume reports interrupted and does not re-run. No live LLM retry in the loop. Upstream mode does not change this arm (Pi's safety is the no-rerun rule).",
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie);
    },
  };
}

/** Combination arms: ClawQL gate closes non-idempotent Golem retries (ClawQL side measured). */
function makeComboArm(id: "golem+clawql" | "pi-durable+clawql"): DurabilityArm {
  // Reuse ClawQL file-journal path via dynamic import to avoid circular deps at module load.
  return {
    id,
    run: ({ n }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const { clawqlFileJournalArm } = await import("./file-journal-arm.js");
          const base = await Effect.runPromise(clawqlFileJournalArm.run({ n }));
          return {
            armId: id,
            status: "measured",
            honesty: `${id}: ClawQL tool-gate side of the combination (approval consumed → outcome_unknown, never re-send). Peer→MCP live bridge still open; this measures the ClawQL refusal that closes non-idempotent retries.`,
            modes: base.modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

export const golemArm = makeGolemLiveArm();
export const piDurableArm = makePiLiveArm();
export const golemClawqlArm = makeComboArm("golem+clawql");
export const piDurableClawqlArm = makeComboArm("pi-durable+clawql");
