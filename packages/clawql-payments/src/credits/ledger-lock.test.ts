import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  createInProcessTenantLedgerLock,
  createRedisTenantLedgerLock,
  ledgerLockKey,
  setTenantLedgerLockForTests,
  tenantLedgerAdvisoryLockId,
  type RedisLockClient,
} from "./ledger-lock.js";

afterEach(() => {
  setTenantLedgerLockForTests(null);
});

describe("ledgerLockKey", () => {
  it("namespaces tenant ids", () => {
    expect(ledgerLockKey(" acme ")).toBe("clawql:payments:ledger-lock:acme");
    expect(ledgerLockKey("")).toBe("clawql:payments:ledger-lock:default");
  });
});

describe("tenantLedgerAdvisoryLockId", () => {
  it("is stable and signed-bigint shaped", () => {
    const a = tenantLedgerAdvisoryLockId("t1");
    const b = tenantLedgerAdvisoryLockId("t1");
    expect(a).toBe(b);
    expect(a).not.toBe(tenantLedgerAdvisoryLockId("t2"));
    expect(/^-?\d+$/.test(a)).toBe(true);
  });
});

describe("createInProcessTenantLedgerLock", () => {
  it("serializes concurrent critical sections per tenant", async () => {
    const lock = createInProcessTenantLedgerLock();
    const order: number[] = [];
    const run = (n: number, delayMs: number) =>
      Effect.runPromise(
        lock.withLock("tenant-a", async () => {
          order.push(n);
          await new Promise((r) => setTimeout(r, delayMs));
          order.push(n + 10);
          return n;
        })
      );
    const [a, b] = await Promise.all([run(1, 30), run(2, 5)]);
    expect([a, b].sort()).toEqual([1, 2]);
    // No interleaving: 1,11 before 2,12 or reverse — never 1,2,11,12.
    expect(order).toEqual(order[0] === 1 ? [1, 11, 2, 12] : [2, 12, 1, 11]);
  });

  it("allows different tenants in parallel", async () => {
    const lock = createInProcessTenantLedgerLock();
    let overlap = 0;
    let active = 0;
    const run = (tenant: string) =>
      Effect.runPromise(
        lock.withLock(tenant, async () => {
          active += 1;
          overlap = Math.max(overlap, active);
          await new Promise((r) => setTimeout(r, 20));
          active -= 1;
        })
      );
    await Promise.all([run("a"), run("b")]);
    expect(overlap).toBe(2);
  });
});

describe("createRedisTenantLedgerLock fencing", () => {
  it("acquire SET NX + compare-and-delete release", async () => {
    const store = new Map<string, string>();
    const client: RedisLockClient = {
      setNxPx: async (key, token, _ttl) => {
        if (store.has(key)) return false;
        store.set(key, token);
        return true;
      },
      compareAndDelete: async (key, token) => {
        if (store.get(key) !== token) return false;
        store.delete(key);
        return true;
      },
    };
    const lock = createRedisTenantLedgerLock(client, { waitMs: 200, ttlMs: 5000 });
    await Effect.runPromise(
      lock.withLock("t", async () => {
        expect(store.size).toBe(1);
      })
    );
    expect(store.size).toBe(0);
  });

  it("does not clear another owner's token on stale release", async () => {
    const store = new Map<string, string>();
    const client: RedisLockClient = {
      setNxPx: async (key, token) => {
        if (store.has(key)) return false;
        store.set(key, token);
        return true;
      },
      compareAndDelete: async (key, token) => {
        if (store.get(key) !== token) return false;
        store.delete(key);
        return true;
      },
    };
    // Simulate steal: after n1 acquires, overwrite token as n2 would with WeakNoFence.
    const key = ledgerLockKey("t");
    store.set(key, "owner-2-token");
    const stale = await client.compareAndDelete(key, "owner-1-stale");
    expect(stale).toBe(false);
    expect(store.get(key)).toBe("owner-2-token");
  });

  it("times out when lock never frees", async () => {
    const client: RedisLockClient = {
      setNxPx: async () => false,
      compareAndDelete: async () => false,
    };
    const lock = createRedisTenantLedgerLock(client, { waitMs: 80, ttlMs: 1000 });
    await expect(Effect.runPromise(lock.withLock("t", async () => 1))).rejects.toMatchObject({
      _tag: "LedgerLockError",
    });
  });
});
