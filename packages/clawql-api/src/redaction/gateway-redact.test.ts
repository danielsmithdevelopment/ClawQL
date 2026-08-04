import { describe, expect, it, vi, afterEach } from "vitest";

import { gatewayRedactionEnabled, maybeGatewayRedactText } from "./gateway-redact.js";

describe("gateway redact chain", () => {
  const prevPresidio = process.env.CLAWQL_ENABLE_PRESIDIO;
  const prevPf = process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
  const prevAnalyzer = process.env.CLAWQL_PRESIDIO_ANALYZER_URL;
  const prevAnon = process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL;
  const prevPfUrl = process.env.CLAWQL_PRIVACY_FILTER_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevPresidio === undefined) delete process.env.CLAWQL_ENABLE_PRESIDIO;
    else process.env.CLAWQL_ENABLE_PRESIDIO = prevPresidio;
    if (prevPf === undefined) delete process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
    else process.env.CLAWQL_ENABLE_PRIVACY_FILTER = prevPf;
    if (prevAnalyzer === undefined) delete process.env.CLAWQL_PRESIDIO_ANALYZER_URL;
    else process.env.CLAWQL_PRESIDIO_ANALYZER_URL = prevAnalyzer;
    if (prevAnon === undefined) delete process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL;
    else process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL = prevAnon;
    if (prevPfUrl === undefined) delete process.env.CLAWQL_PRIVACY_FILTER_URL;
    else process.env.CLAWQL_PRIVACY_FILTER_URL = prevPfUrl;
  });

  it("disabled when both layers off", () => {
    delete process.env.CLAWQL_ENABLE_PRESIDIO;
    delete process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
    expect(gatewayRedactionEnabled()).toBe(false);
  });

  it("runs Presidio then Privacy Filter", async () => {
    process.env.CLAWQL_ENABLE_PRESIDIO = "1";
    process.env.CLAWQL_PRESIDIO_ANALYZER_URL = "http://analyzer";
    process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL = "http://anonymizer";
    process.env.CLAWQL_ENABLE_PRIVACY_FILTER = "1";
    process.env.CLAWQL_PRIVACY_FILTER_URL = "http://pf";

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/analyze")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith("/anonymize")) {
        return new Response(JSON.stringify({ text: "from-presidio" }), { status: 200 });
      }
      if (url.endsWith("/redact")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
        expect(body.text).toBe("Alice email@x.test leftover");
        return new Response(
          JSON.stringify({ ok: true, text: "Alice [PRIVATE_EMAIL] leftover", mode: "demo" }),
          { status: 200 }
        );
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Presidio finds nothing → text unchanged → Privacy Filter catches email
    const out = await maybeGatewayRedactText("Alice email@x.test leftover");
    expect(out).toBe("Alice [PRIVATE_EMAIL] leftover");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("privacy filter only when Presidio off", async () => {
    delete process.env.CLAWQL_ENABLE_PRESIDIO;
    process.env.CLAWQL_ENABLE_PRIVACY_FILTER = "1";
    process.env.CLAWQL_PRIVACY_FILTER_URL = "http://pf";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, text: "[PRIVATE_PERSON] was here" }), {
          status: 200,
        })
      )
    );

    expect(gatewayRedactionEnabled()).toBe(true);
    const out = await maybeGatewayRedactText("Bob was here");
    expect(out).toBe("[PRIVATE_PERSON] was here");
  });
});
