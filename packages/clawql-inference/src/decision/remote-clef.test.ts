import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  callRemoteClefEffect,
  clefBackendId,
  isClefBackendId,
  remoteClefAvailable,
  resolveClefVariant,
  selfHostedClefAvailable,
} from "./remote-clef.js";

describe("remote-clef", () => {
  it("resolves variants and backend ids", () => {
    expect(resolveClefVariant("clef")).toBe("clef");
    expect(resolveClefVariant("clef-flash")).toBe("clef-flash");
    expect(clefBackendId("clef-flash")).toBe("cloudflare/clef-flash");
    expect(isClefBackendId("cloudflare/clef-flash")).toBe(true);
    expect(isClefBackendId("local", "clawql")).toBe(false);
  });

  it("self-host SystemOne is the measure path; Workers AI alone is not", () => {
    expect(selfHostedClefAvailable({ CLAWQL_CLEF_SYSTEMONE_URL: "http://127.0.0.1:30000" })).toBe(
      true
    );
    expect(remoteClefAvailable({ CLAWQL_CLEF_SYSTEMONE_URL: "http://127.0.0.1:30000" })).toBe(true);
    expect(remoteClefAvailable({ CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" })).toBe(
      true
    );
    expect(selfHostedClefAvailable({ CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" })).toBe(
      false
    );
    expect(remoteClefAvailable({})).toBe(false);
  });

  it("Workers AI nested response envelope → OpenAI answers", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            response: {
              model: "clef-flash",
              answers: {
                route: {
                  type: "choice",
                  choice: "mcp.search",
                  confidence: 0.88,
                  probabilities: { "mcp.search": 0.88, "mcp.execute": 0.12 },
                },
              },
            },
          },
        }),
        { status: 200 }
      );

    const out = await Effect.runPromise(
      callRemoteClefEffect(
        {
          model: "clef-flash",
          input: "find stripe endpoints",
          use_site_id: "search_provider_tool_routing",
          questions: [
            {
              type: "choice",
              name: "route",
              instructions: "pick",
              choices: [
                { value: "mcp.search", description: "search" },
                { value: "mcp.execute", description: "execute" },
              ],
            },
          ],
        },
        {
          env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" },
          fetchImpl,
        }
      )
    );
    expect(out.answers[0]).toMatchObject({ type: "choice", choice: "mcp.search" });
  });

  it("Workers AI stringified nested response → OpenAI answers", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              model: "clef-flash",
              answers: {
                route: {
                  type: "choice",
                  choice: "mcp.execute",
                  confidence: 0.7,
                  probabilities: { "mcp.search": 0.3, "mcp.execute": 0.7 },
                },
              },
            }),
          },
        }),
        { status: 200 }
      );

    const out = await Effect.runPromise(
      callRemoteClefEffect(
        {
          model: "clef-flash",
          input: "run stripe charge",
          use_site_id: "search_provider_tool_routing",
          questions: [
            {
              type: "choice",
              name: "route",
              instructions: "pick",
              choices: [
                { value: "mcp.search", description: "search" },
                { value: "mcp.execute", description: "execute" },
              ],
            },
          ],
        },
        {
          env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" },
          fetchImpl,
        }
      )
    );
    expect(out.answers[0]).toMatchObject({ type: "choice", choice: "mcp.execute" });
  });

  it("Workers AI envelope → OpenAI answers", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            model: "clef-flash",
            answers: {
              route: {
                type: "choice",
                choice: "mcp.search",
                confidence: 0.9,
                probabilities: { "mcp.search": 0.9, "mcp.execute": 0.1 },
              },
            },
          },
        }),
        { status: 200 }
      );

    const out = await Effect.runPromise(
      callRemoteClefEffect(
        {
          model: "clef-flash",
          input: "find stripe endpoints",
          use_site_id: "search_provider_tool_routing",
          questions: [
            {
              type: "choice",
              name: "route",
              instructions: "pick",
              choices: [
                { value: "mcp.search", description: "search" },
                { value: "mcp.execute", description: "execute" },
              ],
            },
          ],
        },
        {
          env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" },
          fetchImpl,
        }
      )
    );
    expect(out.backend_id).toBe("cloudflare/clef-flash");
    expect(out.answers[0]).toMatchObject({ type: "choice", name: "route", choice: "mcp.search" });
    expect(out.calibrated).toBe(false);
  });
});
