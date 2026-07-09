import { describe, expect, it, vi, afterEach } from "vitest";

import { loadPresidioConfig, maybePresidioRedactText, presidioEnabled } from "./client.js";

describe("presidio client", () => {
  const prevEnable = process.env.CLAWQL_ENABLE_PRESIDIO;
  const prevAnalyzer = process.env.CLAWQL_PRESIDIO_ANALYZER_URL;
  const prevAnon = process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevEnable === undefined) delete process.env.CLAWQL_ENABLE_PRESIDIO;
    else process.env.CLAWQL_ENABLE_PRESIDIO = prevEnable;
    if (prevAnalyzer === undefined) delete process.env.CLAWQL_PRESIDIO_ANALYZER_URL;
    else process.env.CLAWQL_PRESIDIO_ANALYZER_URL = prevAnalyzer;
    if (prevAnon === undefined) delete process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL;
    else process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL = prevAnon;
  });

  it("disabled by default", () => {
    delete process.env.CLAWQL_ENABLE_PRESIDIO;
    expect(presidioEnabled()).toBe(false);
    expect(loadPresidioConfig()).toBeNull();
  });

  it("passes through when disabled", async () => {
    delete process.env.CLAWQL_ENABLE_PRESIDIO;
    const out = await maybePresidioRedactText("hello");
    expect(out).toBe("hello");
  });

  it("redacts when analyzer returns entities", async () => {
    process.env.CLAWQL_ENABLE_PRESIDIO = "1";
    process.env.CLAWQL_PRESIDIO_ANALYZER_URL = "http://analyzer";
    process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL = "http://anonymizer";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/analyze")) {
          return new Response(
            JSON.stringify([{ entity_type: "PERSON", start: 0, end: 4, score: 0.9 }]),
            {
              status: 200,
            }
          );
        }
        return new Response(JSON.stringify({ text: "<REDACTED>" }), { status: 200 });
      })
    );

    const out = await maybePresidioRedactText("John Doe");
    expect(out).toBe("<REDACTED>");
  });
});
