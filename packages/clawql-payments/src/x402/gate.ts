import { Effect } from "effect";
import { z } from "zod";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import type { X402Asset } from "./wallet.js";
import { X402GateService } from "./x402-gate-service.js";

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

export async function createX402Gate(
  input: X402GateInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ gate: X402Gate; path: string }> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const gates = yield* X402GateService;
      return yield* gates.create(input);
    }),
    env
  );
}

export async function listX402Gates(env: NodeJS.ProcessEnv = process.env): Promise<X402Gate[]> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const gates = yield* X402GateService;
      return yield* gates.list();
    }),
    env
  );
}

export async function findX402GateForResource(
  resource: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<X402Gate | undefined> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const gates = yield* X402GateService;
      return yield* gates.findForResource(resource);
    }),
    env
  );
}
