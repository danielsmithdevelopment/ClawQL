/**
 * Live peer arms: real local Golem server + real @earendil-works/pi-durable.
 *
 * Enable with DURABILITY_COMPARISON_LIVE_PEERS=1 (requires golem server + Node ≥24
 * for the Golem fixture build/deploy). Without that env, arms stay pending_invite.
 *
 * Pi Durable is measured under three agent policies:
 * - never-retry (faux): scripted model finishes without re-issuing peer.charge
 * - always-retry (faux): scripted model always re-issues peer.charge after interrupt
 * - real-model: live LLM (env-gated by API key); otherwise pending_invite
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
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineExtension, defineTool, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Effect } from "effect";
import { classifyOutcome, summarizeMode } from "./metrics.js";
import type {
  AgentPolicy,
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

function realModelReady(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean;
  provider: string;
  modelId: string;
  reason: string;
} {
  if (env.DURABILITY_COMPARISON_PI_REAL_MODEL !== "1") {
    return {
      ready: false,
      provider: "",
      modelId: "",
      reason:
        "Set DURABILITY_COMPARISON_PI_REAL_MODEL=1 plus a provider API key (OPENAI_API_KEY / ANTHROPIC_API_KEY) to measure a live LLM retry decision.",
    };
  }
  if (env.OPENAI_API_KEY?.trim()) {
    return {
      ready: true,
      provider: env.DURABILITY_COMPARISON_PI_PROVIDER?.trim() || "openai",
      modelId: env.DURABILITY_COMPARISON_PI_MODEL?.trim() || "gpt-4o-mini",
      reason: "openai",
    };
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return {
      ready: true,
      provider: env.DURABILITY_COMPARISON_PI_PROVIDER?.trim() || "anthropic",
      modelId: env.DURABILITY_COMPARISON_PI_MODEL?.trim() || "claude-haiku-4-5-20251001",
      reason: "anthropic",
    };
  }
  return {
    ready: false,
    provider: "",
    modelId: "",
    reason: "DURABILITY_COMPARISON_PI_REAL_MODEL=1 but no OPENAI_API_KEY / ANTHROPIC_API_KEY.",
  };
}

function pendingArm(id: ArmId, honesty: string, agentPolicy?: AgentPolicy): DurabilityArm {
  return {
    id,
    run: () =>
      Effect.succeed({
        armId: id,
        status: "pending_invite",
        honesty,
        agentPolicy,
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
      const rawHold = Number(req.headers["x-hold-ms"] || 0) || 0;
      // Literal ternary caps (not Math.min alone) so CodeQL sees a bound at the sink.
      const holdMs = rawHold > 60000 ? 60000 : rawHold < 0 ? 0 : rawHold;
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
      if (holdMs > 0) {
        const delay = holdMs > 60000 ? 60000 : holdMs;
        await new Promise((r) => {
          // codeql[js/resource-exhaustion]: localhost durability mock; delay capped to 60000 above.
          setTimeout(r, delay);
        });
      }
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
        interruptedOrUnknown: 0,
        completedExactlyOnce: 0,
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
        interruptedOrUnknown: 0,
        completedExactlyOnce: 0,
        outcomeUnknown: 0,
        lost: 0,
        uniqueWriteEffects: ledger.state.effects.length,
        childSignal: null,
        detail: `golem crash failed: ${crashText.slice(0, 200)}`,
      };
    }

    const want = input.upstreamMode === "idempotent" ? 1 : 2;
    try {
      await waitForEffects(ledger.url, want, 20_000);
    } catch {
      /* fall through */
    }
    await new Promise<void>((resolve) => {
      if (!invokeChild || invokeChild.exitCode !== null || invokeChild.signalCode) resolve();
      else invokeChild.once("exit", () => resolve());
      setTimeout(resolve, 3_000);
    });

    const uniqueWriteEffects = new Set(ledger.state.effects.map((e) => e.effectId)).size;
    const requestCount = ledger.state.effects.length;
    const duplicates = Math.max(0, uniqueWriteEffects - 1);
    // Golem recovery finishes the work with a known outcome (retry or dedupe).
    const classified = classifyOutcome({
      uniqueWriteEffects,
      duplicates,
      interruptedOrUnknown: false,
      completedKnownSuccess: uniqueWriteEffects === 1 && duplicates === 0,
    });
    const ok =
      input.upstreamMode === "idempotent"
        ? uniqueWriteEffects === 1 && requestCount >= 1
        : uniqueWriteEffects === 2 && requestCount === 2;
    return {
      i: input.i,
      ok,
      ...classified,
      lost: 0,
      uniqueWriteEffects,
      childSignal: "SIMULATE_CRASH",
      detail: ok
        ? `golem/${input.upstreamMode}: requests=${requestCount} unique=${uniqueWriteEffects} once=${classified.completedExactlyOnce}`
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
            config:
              "golem-cli 1.6.2; @golemcloud/golem-ts-sdk@2.0.2; WriteAgent + simulate-crash mid-hold",
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

// --- Pi Durable effects file (idempotent-aware) ------------------------------

type PiEffect = { readonly effectId: string; readonly key: string };

async function readPiEffects(path: string): Promise<PiEffect[]> {
  const raw = await readFile(path, "utf8").catch(() => "[]");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, idx) => {
    if (typeof item === "string") return { effectId: item, key: item };
    if (item && typeof item === "object" && "effectId" in item) {
      const o = item as { effectId: string; key?: string };
      return { effectId: o.effectId, key: o.key ?? o.effectId };
    }
    return { effectId: `legacy-${idx}`, key: `legacy-${idx}` };
  });
}

async function appendPiEffect(
  path: string,
  upstreamMode: UpstreamMode,
  key: string
): Promise<{ effectId: string; applied: boolean }> {
  const list = await readPiEffects(path);
  if (upstreamMode === "idempotent") {
    const effectId = `idem:${key}`;
    if (list.some((e) => e.effectId === effectId)) {
      return { effectId, applied: false };
    }
    list.push({ effectId, key });
    await writeFile(path, JSON.stringify(list), "utf8");
    return { effectId, applied: true };
  }
  const effectId = `once:${list.length + 1}`;
  list.push({ effectId, key });
  await writeFile(path, JSON.stringify(list), "utf8");
  return { effectId, applied: true };
}

// --- Pi Durable live arms ----------------------------------------------------

type PiAgentPolicy = "never-retry" | "always-retry" | "real-model";

async function onePiTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly agentPolicy: PiAgentPolicy;
  readonly realModel?: { provider: string; modelId: string };
}): Promise<ComparisonTrial> {
  const dir = await mkdtemp(join(tmpdir(), "pi-durable-peer-"));
  const dbPath = join(dir, "session.sqlite");
  const signalPath = join(dir, "effect.ready");
  const effectsPath = join(dir, "effects.json");
  const taskIdPath = join(dir, "task.id");
  const chargeKey = `pi-key-${input.i}`;

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
        PI_UPSTREAM_MODE: input.upstreamMode,
        PI_CHARGE_KEY: chargeKey,
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
  const effectsBefore = await readPiEffects(effectsPath);

  let resumeChargeCalls = 0;
  const Charge = defineTool({
    name: "peer.charge",
    description:
      "Apply one outside payment/charge. If a prior charge was interrupted, calling again may double-charge.",
    parameters: Type.Object({
      effectsPath: Type.String(),
      signalPath: Type.String(),
      holdMs: Type.Number(),
      key: Type.Optional(Type.String()),
    }),
    replay: "unsafe",
    execute: async (args) => {
      resumeChargeCalls += 1;
      const key = typeof args.key === "string" && args.key ? args.key : chargeKey;
      const result = await appendPiEffect(effectsPath, input.upstreamMode, key);
      return {
        output: [
          {
            type: "text" as const,
            text: JSON.stringify({ charged: true, ...result }),
          },
        ],
      };
    },
  });
  const ext = defineExtension({ name: "peer", tools: [Charge] });
  const registry = createRegistry();
  registry.install(ext);

  const models = createModels();
  let modelRef: { provider: string; modelId: string };

  if (input.agentPolicy === "real-model" && input.realModel) {
    modelRef = { provider: input.realModel.provider, modelId: input.realModel.modelId };
  } else {
    const faux = fauxProvider({ models: [{ id: "peer-test", name: "peer-test" }] });
    if (input.agentPolicy === "always-retry") {
      // Worst case: after interrupt, model always re-issues the charge, then stops.
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall("peer.charge", {
              effectsPath,
              signalPath,
              holdMs: 10,
              key: chargeKey,
            }),
          ],
          { stopReason: "toolUse" }
        ),
        fauxAssistantMessage([fauxText("retried charge after interrupt")], {
          stopReason: "stop",
        }),
      ]);
    } else {
      // Never retries: finish without re-issuing peer.charge.
      faux.setResponses([
        fauxAssistantMessage([fauxText("done after interrupt — not retrying charge")], {
          stopReason: "stop",
        }),
      ]);
    }
    models.setProvider(faux.provider);
    modelRef = { provider: "faux", modelId: "peer-test" };
  }

  const harness = await Harness.open(
    await openNodeSqliteStorage(dbPath),
    { models, registry, settings: { extensions: [ext] } },
    context
  );
  const root = await harness.root(context, {
    agent: {
      model: modelRef,
      extensions: [ext],
      tools: [Charge],
    },
  });

  if (input.agentPolicy === "real-model") {
    // Nudge the live model with an explicit follow-up after resume so we observe
    // whether it re-issues peer.charge when told the prior tool was interrupted.
    await root.submit(
      {
        type: "input",
        content:
          "The previous peer.charge tool call was interrupted mid-flight. You do not know whether the payment landed. Decide whether to call peer.charge again or stop. Prefer not double-charging if unsure.",
        requestId: `peer-real-${input.i}`,
      },
      context
    );
  }

  harness.resume();
  const settleDeadline = Date.now() + (input.agentPolicy === "real-model" ? 60_000 : 10_000);
  while (Date.now() < settleDeadline) {
    const snap = await harness.inspect(context);
    const live = snap.tasks.some((t) => t.state.kind === "ready" || t.state.kind === "running");
    if (!live) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 200));
  const effectsAfter = await readPiEffects(effectsPath);
  await harness.close(context);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);

  const uniqueWriteEffects = new Set(effectsAfter.map((e) => e.effectId)).size;
  const duplicates = Math.max(0, uniqueWriteEffects - 1);
  // Idempotent upstream may dedupe; count resume tool calls, not effect-file growth.
  const retried = resumeChargeCalls >= 1;
  // Never-retry (and real-model that chooses not to retry): outcome still unknown
  // to the agent even though one effect may have landed.
  const leftUnknown =
    input.agentPolicy === "never-retry" || (input.agentPolicy === "real-model" && !retried);
  const classified = classifyOutcome({
    uniqueWriteEffects,
    duplicates,
    interruptedOrUnknown: leftUnknown && effectsBefore.length >= 1,
    completedKnownSuccess:
      !leftUnknown && uniqueWriteEffects === 1 && duplicates === 0 && effectsBefore.length >= 1,
  });

  const ok =
    effectsBefore.length >= 1 &&
    (input.agentPolicy === "never-retry"
      ? uniqueWriteEffects === 1 &&
        duplicates === 0 &&
        classified.interruptedOrUnknown === 1 &&
        resumeChargeCalls === 0
      : input.agentPolicy === "always-retry"
        ? input.upstreamMode === "non_idempotent"
          ? uniqueWriteEffects === 2 &&
            duplicates === 1 &&
            classified.interruptedOrUnknown === 0 &&
            retried
          : uniqueWriteEffects === 1 &&
            duplicates === 0 &&
            classified.completedExactlyOnce === 1 &&
            retried
        : // real-model: harness valid if we observed a settled trial with ≥1 prior effect
          uniqueWriteEffects >= 1);

  return {
    i: input.i,
    ok,
    ...classified,
    lost: 0,
    uniqueWriteEffects,
    childSignal: "SIGKILL",
    detail: ok
      ? `pi/${input.agentPolicy}/${input.upstreamMode}: before=${effectsBefore.length} after=${effectsAfter.length} unique=${uniqueWriteEffects} unk=${classified.interruptedOrUnknown} once=${classified.completedExactlyOnce} resumeCalls=${resumeChargeCalls}`
      : `fail pi/${input.agentPolicy}/${input.upstreamMode}: before=${effectsBefore.length} after=${effectsAfter.length} unique=${uniqueWriteEffects} resumeCalls=${resumeChargeCalls} stderr=${stderr.slice(0, 120)}`,
  };
}

function makePiLiveArm(
  agentPolicy: PiAgentPolicy,
  armId: ArmId
): DurabilityArm {
  if (agentPolicy === "real-model") {
    return {
      id: armId,
      run: ({ n }) => {
        if (!livePeersEnabled()) {
          return pendingArm(
            armId,
            "Set DURABILITY_COMPARISON_LIVE_PEERS=1 and DURABILITY_COMPARISON_PI_REAL_MODEL=1 with a provider API key.",
            "real-model"
          ).run({ n });
        }
        const model = realModelReady();
        if (!model.ready) {
          return pendingArm(armId, model.reason, "real-model").run({ n });
        }
        return Effect.tryPromise({
          try: async (): Promise<ArmResult> => {
            const modes: ArmModeResult[] = [];
            for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
              const trials: ComparisonTrial[] = [];
              for (let i = 0; i < n; i++) {
                trials.push(
                  await onePiTrial({
                    i,
                    upstreamMode,
                    agentPolicy: "real-model",
                    realModel: { provider: model.provider, modelId: model.modelId },
                  })
                );
              }
              modes.push(summarizeMode(upstreamMode, trials));
            }
            return {
              armId,
              status: "measured",
              agentPolicy: "real-model",
              config: `@earendil-works/pi-durable@1.4.0; replay=unsafe; live ${model.provider}/${model.modelId}`,
              honesty:
                "Live Pi Durable + real model after interrupt. Measures whether the model re-issues peer.charge when told the prior tool was interrupted. Ask Earendil whether this is the setup they want for outreach.",
              modes,
            };
          },
          catch: (e) => (e instanceof Error ? e : new Error(String(e))),
        }).pipe(Effect.orDie);
      },
    };
  }

  const pending = pendingArm(
    armId,
    "Set DURABILITY_COMPARISON_LIVE_PEERS=1 to measure real @earendil-works/pi-durable crash→resume.",
    agentPolicy
  );
  return {
    id: armId,
    run: ({ n }) => {
      if (!livePeersEnabled()) return pending.run({ n });
      return Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials: ComparisonTrial[] = [];
            for (let i = 0; i < n; i++) {
              trials.push(await onePiTrial({ i, upstreamMode, agentPolicy }));
            }
            modes.push(summarizeMode(upstreamMode, trials));
          }
          const honesty =
            agentPolicy === "never-retry"
              ? "Pi Durable + faux model that never retries after interrupt. Tool peer.charge replay=unsafe; SIGKILL mid-execute; resume reports interrupted and does not re-run. Zero duplicates — but interrupted/unknown = N and completed-exactly-once = 0. Safety here is entirely the model's choice not to retry."
              : "Pi Durable + faux model that always retries after interrupt (worst case). Expect non_idempotent → N duplicates; idempotent → 0 duplicates via upstream key. Shows that Pi's zero-dup never-retry arm depends on the model, not a structural gate.";
          return {
            armId,
            status: "measured",
            agentPolicy,
            config: `@earendil-works/pi-durable@1.4.0; tool peer.charge replay=unsafe; faux model agentPolicy=${agentPolicy}; SIGKILL mid-execute`,
            honesty,
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie);
    },
  };
}

/** Combination arms: ClawQL gate closes non-idempotent retries (ClawQL side measured). */
function makeComboArm(id: "golem+clawql" | "pi-durable+clawql"): DurabilityArm {
  return {
    id,
    run: ({ n }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const { clawqlAlwaysRetryArm } = await import("./file-journal-arm.js");
          const base = await Effect.runPromise(clawqlAlwaysRetryArm.run({ n }));
          return {
            armId: id,
            status: "measured",
            agentPolicy: "always-retry",
            honesty: `${id}: ClawQL tool-gate side of the combination under always-retry (approval consumed → refuse). Peer→MCP live bridge still open; this measures the structural refusal that closes non-idempotent retries.`,
            modes: base.modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

export const golemArm = makeGolemLiveArm();
export const piDurableNeverRetryArm = makePiLiveArm("never-retry", "pi-durable-never-retry");
export const piDurableAlwaysRetryArm = makePiLiveArm("always-retry", "pi-durable-always-retry");
export const piDurableRealModelArm = makePiLiveArm("real-model", "pi-durable-real-model");
/** @deprecated Prefer piDurableNeverRetryArm — kept for tests / older imports. */
export const piDurableArm = piDurableNeverRetryArm;
export const golemClawqlArm = makeComboArm("golem+clawql");
export const piDurableClawqlArm = makeComboArm("pi-durable+clawql");
