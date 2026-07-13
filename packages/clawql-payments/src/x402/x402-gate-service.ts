import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { z } from "zod";
import { resolveX402GatesPath } from "../config/paths.js";
import { X402Error } from "../errors/payment-errors.js";
import { X402GateSchema, type X402Gate, type X402GateInput, type X402GatesFile } from "./gate.js";
import type { X402Asset } from "./wallet.js";

/** Effect service for x402 gate configuration (`x402-gates.json`). */
export class X402GateService extends Context.Tag("clawql/X402GateService")<
  X402GateService,
  {
    readonly create: (
      input: X402GateInput
    ) => Effect.Effect<{ gate: X402Gate; path: string }, X402Error>;
    readonly list: () => Effect.Effect<X402Gate[], X402Error>;
    readonly findForResource: (resource: string) => Effect.Effect<X402Gate | undefined, X402Error>;
  }
>() {}

function gateResource(input: X402GateInput): string {
  if (input.tool?.trim()) return `tool:${input.tool.trim()}`;
  if (input.resource?.trim()) return input.resource.trim();
  throw new Error("x402 gate requires --resource or --tool");
}

function loadGatesFileEffect(env: NodeJS.ProcessEnv): Effect.Effect<X402GatesFile, X402Error> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveX402GatesPath(env);
      try {
        const raw = await readFile(path, "utf8");
        return { gates: z.array(X402GateSchema).parse(JSON.parse(raw).gates ?? []) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return { gates: [] };
        }
        throw err;
      }
    },
    catch: (cause) =>
      new X402Error({
        reason: "failed to load x402 gates",
        cause,
      }),
  });
}

function saveGatesFileEffect(
  file: X402GatesFile,
  env: NodeJS.ProcessEnv
): Effect.Effect<string, X402Error> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveX402GatesPath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      return path;
    },
    catch: (cause) =>
      new X402Error({
        reason: "failed to save x402 gates",
        cause,
      }),
  });
}

export function x402GateLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<X402GateService> {
  return Layer.succeed(
    X402GateService,
    X402GateService.of({
      create: (input) =>
        Effect.gen(function* () {
          const resource = gateResource(input);
          const file = yield* loadGatesFileEffect(env);
          const gate: X402Gate = {
            id: `gate_${Date.now().toString(36)}`,
            resource,
            tool: input.tool?.trim(),
            price: input.price,
            asset: (input.asset ?? "USDC") as X402Asset,
            createdAt: new Date().toISOString(),
          };
          file.gates = file.gates.filter((g) => g.resource !== resource);
          file.gates.push(gate);
          const path = yield* saveGatesFileEffect(file, env);
          return { gate, path };
        }),
      list: () =>
        Effect.gen(function* () {
          const file = yield* loadGatesFileEffect(env);
          return file.gates;
        }),
      findForResource: (resource) =>
        Effect.gen(function* () {
          const file = yield* loadGatesFileEffect(env);
          return file.gates.find((g) => g.resource === resource || g.tool === resource);
        }),
    })
  );
}
