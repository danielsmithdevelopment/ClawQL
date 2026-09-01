import { describe, expect, it } from "vitest";
import { tokenizeChatMessagesAsync } from "./messages.js";

describe("tokenizeChatMessagesAsync", () => {
  it("attaches cl100k_base counts with per-message overhead", async () => {
    const out = await tokenizeChatMessagesAsync(
      [
        { role: "system", content: "Harness rules." },
        { role: "user", content: "hello" },
      ],
      { CLAWQL_INFERENCE_TOKENIZE: "1" }
    );
    expect(out[0]?.tokens).toBeGreaterThan(3);
    expect(out[1]?.tokens).toBeGreaterThan(3);
  });

  it("no-ops when CLAWQL_INFERENCE_TOKENIZE=0", async () => {
    const messages = [{ role: "user", content: "hello" }];
    const out = await tokenizeChatMessagesAsync(messages, {
      CLAWQL_INFERENCE_TOKENIZE: "0",
    });
    expect(out[0]?.tokens).toBeUndefined();
  });
});
