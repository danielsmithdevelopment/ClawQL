/**
 * Child process for Pi Durable peer arm: start a write task, apply the side effect,
 * signal the parent, then hold with a non-durable timer until SIGKILL.
 *
 * Important: do NOT use runtime.sleepUntil here. Durable sleep ends the phase and
 * stores a checkpoint; a crash after that resumes past the write. Mid-flight crash
 * measurement needs an unfinished phase so reopen restarts from the phase top.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineExtension, defineTask, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const dbPath = required("PI_DB_PATH");
const signalPath = required("PI_SIGNAL_PATH");
const effectsPath = required("PI_EFFECTS_PATH");
const useMemo = process.env.PI_USE_MEMO === "1";
const holdMs = Math.max(100, Number(process.env.PI_HOLD_MS || 3000));
const context = BACKGROUND_CONTEXT;

writeFileSync(effectsPath, "[]");

const WriteTask = defineTask<{ useMemo: boolean }, { phase: "write" }, { done: true }>({
  name: "peer.write",
  version: 1,
  initial: () => ({ phase: "write" }),
  phases: {
    write: async (task, runtime, taskContext) => {
      const apply = () => {
        const list = JSON.parse(readFileSync(effectsPath, "utf8")) as string[];
        list.push(`effect-${list.length + 1}`);
        writeFileSync(effectsPath, JSON.stringify(list));
      };

      if (task.input.useMemo) {
        if ((await runtime.memo("wrote", taskContext)) === undefined) {
          await runtime.memo("wrote", true, taskContext);
          apply();
        }
      } else {
        apply();
      }

      // Effect is visible; hold without a durable checkpoint so SIGKILL leaves the phase unfinished.
      writeFileSync(signalPath, "ready");
      await new Promise((r) => setTimeout(r, holdMs));

      await runtime.commit(
        () => ({ status: "terminal", outcome: { status: "completed", result: { done: true } } }),
        taskContext
      );
    },
  },
  abort: async (_task, runtime, taskContext) => {
    await runtime.commit(
      () => ({ status: "terminal", outcome: { status: "aborted" } }),
      taskContext
    );
  },
});

const registry = createRegistry();
registry.install(defineExtension({ name: "peer", tasks: [WriteTask] }));

const harness = await Harness.open(
  await openNodeSqliteStorage(dbPath),
  { models: createModels(), registry },
  context
);

const taskId = await (
  await harness.root(context)
).commit(
  (tx) => tx.createTask(WriteTask, { useMemo }, { ownership: { kind: "conversation" } }),
  context
);
writeFileSync(required("PI_TASK_ID_PATH"), String(taskId));

harness.resume();
// Keep the event loop alive until SIGKILL (Promise alone is not enough).
setInterval(() => {}, 60_000);
await new Promise(() => {
  /* wait for SIGKILL */
});
