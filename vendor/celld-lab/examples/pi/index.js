import { DurableObject } from "cloudflare:workers";
import { PiHarness } from "agents/harness";
import { Lifecycle } from "agents/lifecycle";
import { createWorkersAI } from "agents/providers/pi";

// The pi provider speaks OpenAI chat completions, so any endpoint with that
// shape serves it: OpenRouter by default, or a local server through
// PI_ENDPOINT.
function createDirectAi(url, key) {
  return {
    async run(model, input, options) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, ...input }),
        signal: options?.signal,
      });
      if (options?.returnRawResponse) return response;
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `${url} returned ${response.status}${
            detail ? `: ${detail.slice(0, 512)}` : ""
          }`,
        );
      }
      return response.json();
    },
  };
}

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(
      `the pi example needs ${name}; set it in .dev.vars or in the vars of wrangler.jsonc`,
    );
  }
  return value;
}

export class PiAgent extends DurableObject {
  harness;
  lifecycle;

  constructor(ctx, env) {
    super(ctx, env);
    const ai = createDirectAi(
      required(env, "PI_ENDPOINT"),
      required(env, "OPENROUTER_API_KEY"),
    );
    const runtime = createWorkersAI(ai, { model: required(env, "PI_MODEL") });
    this.harness = new PiHarness({
      models: runtime.models,
      model: runtime.model,
      compaction: {
        enabled: false,
        reserveTokens: 0,
        keepRecentTokens: 0,
      },
    });
    this.lifecycle = Lifecycle.install(this).use(this.harness);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/messages") {
      return Response.json(await this.harness.getMessages());
    }

    const result = await this.harness.prompt("ping");
    const errors = result.messages
      .filter((message) => message.stopReason === "error")
      .map((message) => message.error);
    return Response.json({
      status: result.status,
      operationId: result.operationId,
      errors,
      messages: result.messages,
    }, { status: result.status === "completed" ? 200 : 502 });
  }
}

export default {
  fetch(request, env) {
    const id = env.PI_AGENT.idFromName("local-pi");
    return env.PI_AGENT.get(id).fetch(request);
  },
};
