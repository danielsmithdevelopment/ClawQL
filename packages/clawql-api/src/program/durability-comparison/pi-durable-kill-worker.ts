/**
 * Child process for Pi Durable peer arm.
 *
 * Configuration (must match honesty labels on the board):
 * - Tool `peer.charge` with `replay: "unsafe"` (Pi Durable default).
 * - Scripted faux model issues one tool call (not a live LLM).
 * - SIGKILL mid-execute after the outside write is visible.
 *
 * On resume, Pi Durable's ToolTask recovery reports interrupted and does **not**
 * re-run an unsafe tool. Whether the *model* then retries is the parent arm's
 * agentPolicy (never-retry / always-retry / real-model).
 */
import { readFileSync, writeFileSync } from "node:fs";
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

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const dbPath = required("PI_DB_PATH");
const signalPath = required("PI_SIGNAL_PATH");
const effectsPath = required("PI_EFFECTS_PATH");
const holdMs = Math.max(100, Number(process.env.PI_HOLD_MS || 3000));
const upstreamMode = process.env.PI_UPSTREAM_MODE === "idempotent" ? "idempotent" : "non_idempotent";
const chargeKey = process.env.PI_CHARGE_KEY || "pi-default-key";
const context = BACKGROUND_CONTEXT;

writeFileSync(effectsPath, "[]");

type PiEffect = { effectId: string; key: string };

function appendEffect(): { effectId: string; applied: boolean } {
  const list = JSON.parse(readFileSync(effectsPath, "utf8")) as PiEffect[];
  if (upstreamMode === "idempotent") {
    const effectId = `idem:${chargeKey}`;
    if (list.some((e) => e.effectId === effectId)) {
      return { effectId, applied: false };
    }
    list.push({ effectId, key: chargeKey });
    writeFileSync(effectsPath, JSON.stringify(list));
    return { effectId, applied: true };
  }
  const effectId = `once:${list.length + 1}`;
  list.push({ effectId, key: chargeKey });
  writeFileSync(effectsPath, JSON.stringify(list));
  return { effectId, applied: true };
}

const Charge = defineTool({
  name: "peer.charge",
  description: "Apply one outside write, signal the parent, then hold until crash",
  parameters: Type.Object({
    effectsPath: Type.String(),
    signalPath: Type.String(),
    holdMs: Type.Number(),
    key: Type.Optional(Type.String()),
  }),
  replay: "unsafe",
  execute: async (args) => {
    const result = appendEffect();
    writeFileSync(args.signalPath, "ready");
    await new Promise((r) => setTimeout(r, args.holdMs));
    return {
      output: [{ type: "text" as const, text: JSON.stringify({ charged: true, ...result }) }],
    };
  },
});

const ext = defineExtension({ name: "peer", tools: [Charge] });
const registry = createRegistry();
registry.install(ext);

const faux = fauxProvider({ models: [{ id: "peer-test", name: "peer-test" }] });
faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall("peer.charge", {
        effectsPath,
        signalPath,
        holdMs,
        key: chargeKey,
      }),
    ],
    {
      stopReason: "toolUse",
    }
  ),
  fauxAssistantMessage([fauxText("done")], { stopReason: "stop" }),
]);

const models = createModels();
models.setProvider(faux.provider);

const harness = await Harness.open(
  await openNodeSqliteStorage(dbPath),
  { models, registry, settings: { extensions: [ext] } },
  context
);

const root = await harness.root(context, {
  agent: {
    model: { provider: "faux", modelId: "peer-test" },
    extensions: [ext],
    tools: [Charge],
  },
});

const submission = await root.submit(
  { type: "input", content: "charge once", requestId: "peer-charge-1" },
  context
);
writeFileSync(required("PI_TASK_ID_PATH"), String(submission.id));

harness.resume();
setInterval(() => {}, 60_000);
await new Promise(() => {
  /* wait for SIGKILL while charge holds */
});
