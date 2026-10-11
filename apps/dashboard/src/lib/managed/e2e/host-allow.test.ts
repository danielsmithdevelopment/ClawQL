import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { hostnameEquals } from "./host-allow";

describe("hostnameEquals", () => {
  it("matches exact host and URL hostname", async () => {
    expect(await Effect.runPromise(hostnameEquals("api.github.com", "api.github.com"))).toBe(true);
    expect(await Effect.runPromise(hostnameEquals("https://api.stripe.com/v1", "api.stripe.com"))).toBe(
      true,
    );
  });

  it("does not match substring or suffix hosts", async () => {
    expect(
      await Effect.runPromise(hostnameEquals("https://evil.example/api.github.com", "api.github.com")),
    ).toBe(false);
    expect(
      await Effect.runPromise(hostnameEquals("https://api.github.com.evil.example", "api.github.com")),
    ).toBe(false);
  });
});
