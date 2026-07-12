import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { resolveX402GatesPath } from "../config/paths.js";
import type { X402Asset } from "./wallet.js";

export const X402GateSchema = z.object({
  id: z.string(),
  resource: z.string(),
  tool: z.string().optional(),
  price: z.number().positive(),
  asset: z.enum(["USDC"]).default("USDC"),
  createdAt: z.string(),
});

export type X402Gate = z.infer<typeof X402GateSchema>;

export type X402GatesFile = {
  gates: X402Gate[];
};

export type X402GateInput = {
  resource?: string;
  tool?: string;
  price: number;
  asset?: X402Asset;
};

export type X402PaymentRequirement = {
  status: 402;
  price: number;
  asset: X402Asset;
  payTo: string;
  resource: string;
  facilitatorUrl?: string;
};

async function loadGatesFile(env: NodeJS.ProcessEnv): Promise<X402GatesFile> {
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
}

async function saveGatesFile(file: X402GatesFile, env: NodeJS.ProcessEnv): Promise<string> {
  const path = resolveX402GatesPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function gateResource(input: X402GateInput): string {
  if (input.tool?.trim()) return `tool:${input.tool.trim()}`;
  if (input.resource?.trim()) return input.resource.trim();
  throw new Error("x402 gate requires --resource or --tool");
}

export async function createX402Gate(
  input: X402GateInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ gate: X402Gate; path: string }> {
  const resource = gateResource(input);
  const file = await loadGatesFile(env);
  const gate: X402Gate = {
    id: `gate_${Date.now().toString(36)}`,
    resource,
    tool: input.tool?.trim(),
    price: input.price,
    asset: input.asset ?? "USDC",
    createdAt: new Date().toISOString(),
  };
  file.gates = file.gates.filter((g) => g.resource !== resource);
  file.gates.push(gate);
  const path = await saveGatesFile(file, env);
  return { gate, path };
}

export async function listX402Gates(env: NodeJS.ProcessEnv = process.env): Promise<X402Gate[]> {
  const file = await loadGatesFile(env);
  return file.gates;
}

export async function findX402GateForResource(
  resource: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<X402Gate | undefined> {
  const gates = await listX402Gates(env);
  return gates.find((g) => g.resource === resource || g.tool === resource);
}

export function buildX402PaymentRequirement(input: {
  gate: X402Gate;
  payTo: string;
  facilitatorUrl?: string;
}): X402PaymentRequirement {
  return {
    status: 402,
    price: input.gate.price,
    asset: input.gate.asset,
    payTo: input.payTo,
    resource: input.gate.resource,
    facilitatorUrl: input.facilitatorUrl,
  };
}
