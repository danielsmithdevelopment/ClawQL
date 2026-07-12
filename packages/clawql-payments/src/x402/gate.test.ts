import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createX402Gate, listX402Gates } from "./gate.js";

describe("x402 gates", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-payments-"));
    env = { ...process.env, CLAWQL_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("creates and lists a tool gate", async () => {
    const { gate } = await createX402Gate(
      { tool: "knowledge_search", price: 0.0005, asset: "USDC" },
      env
    );
    expect(gate.resource).toBe("tool:knowledge_search");
    const gates = await listX402Gates(env);
    expect(gates).toHaveLength(1);
    expect(gates[0]?.price).toBe(0.0005);
  });

  it("replaces gate for same resource", async () => {
    await createX402Gate({ resource: "/v1/chat/completions", price: 0.001 }, env);
    await createX402Gate({ resource: "/v1/chat/completions", price: 0.002 }, env);
    const gates = await listX402Gates(env);
    expect(gates).toHaveLength(1);
    expect(gates[0]?.price).toBe(0.002);
  });
});
