import { describe, expect, it, vi } from "vitest";
import { deliverWebhook } from "./delivery.js";

describe("deliverWebhook", () => {
  it("succeeds on first 200", async () => {
    const fetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const r = await deliverWebhook("https://hooks.example.com/x", { id: 1 }, { fetch });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
  });

  it("exhibits retry storm: 429 retries with zero delay (bug)", async () => {
    const sleeps = [];
    const sleep = async (ms) => {
      sleeps.push(ms);
    };
    let n = 0;
    const fetch = vi.fn(async () => {
      n += 1;
      if (n < 4) {
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after": "2" },
        });
      }
      return new Response("ok", { status: 200 });
    });

    const r = await deliverWebhook(
      "https://hooks.example.com/x",
      { id: 1 },
      { fetch, sleep, maxAttempts: 5 }
    );

    // Current buggy behavior: no sleep between retries.
    // After the fix, sleeps should include >= 2000 (Retry-After) or exponential backoff.
    expect(r.ok).toBe(true);
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    expect(sleeps.length).toBe(0);
  });

  it("fails after maxAttempts", async () => {
    const fetch = vi.fn(async () => new Response("no", { status: 500 }));
    const r = await deliverWebhook(
      "https://hooks.example.com/x",
      { id: 1 },
      { fetch, maxAttempts: 3, sleep: async () => {} }
    );
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);
  });
});
