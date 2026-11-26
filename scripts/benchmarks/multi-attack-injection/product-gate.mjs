/**
 * Bridge from the smoke harness to the real clawql-api native tool gate.
 * Requires `npm run build -w clawql-api` (or a prior workspace build).
 *
 * `gateNativeToolBeforeInvoke` returns `{ blocked: false }` or
 * `{ blocked: true, errorResult: { content: [...] } }` — never a bare MCP block.
 */

let apiPromise = null;

async function loadApi() {
  if (!apiPromise) {
    apiPromise = import("clawql-api").catch((e) => {
      throw new Error(
        `clawql-api native gate not available (${e?.message ?? e}) — run: npm run build -w clawql-api`
      );
    });
  }
  return apiPromise;
}

function parseDenyBody(decision) {
  const text = decision?.errorResult?.content?.[0]?.text;
  if (typeof text !== "string") {
    return { status: "blocked", mechanism: "unknown", reason: "missing_error_body" };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { status: "blocked", mechanism: "unknown", reason: text.slice(0, 200) };
  }
}

export async function resetSessionLabels() {
  const api = await loadApi();
  if (typeof api.clearAllSessionLabelsSync === "function") {
    api.clearAllSessionLabelsSync();
  }
}

/**
 * @param {string} sessionId
 * @param {NodeJS.ProcessEnv} env
 */
export async function makeProductInvoke(sessionId, env) {
  const api = await loadApi();
  if (typeof api.gateNativeToolBeforeInvoke !== "function") {
    throw new Error(
      "clawql-api missing gateNativeToolBeforeInvoke — rebuild clawql-api"
    );
  }

  return {
    async invoke(toolName, args) {
      if (toolName === "search") {
        return { blocked: false, detail: "search_passthrough_smoke" };
      }
      if (toolName === "memory_recall") {
        const decision = await api.gateNativeToolBeforeInvoke({
          toolName,
          args,
          sessionId,
          env,
        });
        if (decision.blocked) {
          const body = parseDenyBody(decision);
          return {
            blocked: true,
            status: body.status,
            mechanism: body.mechanism,
            detail: body.reason,
          };
        }
        api.accumulateNativeToolReadAfterSuccess({
          toolName,
          success: true,
          sessionId,
          env,
        });
        return { blocked: false, detail: "recall_allowed" };
      }

      const decision = await api.gateNativeToolBeforeInvoke({
        toolName,
        args,
        sessionId,
        env,
      });
      if (!decision.blocked) return { blocked: false, detail: "allowed" };
      const body = parseDenyBody(decision);
      return {
        blocked: true,
        status: body.status,
        mechanism: body.mechanism,
        detail: body.reason ?? body.status,
        executionId: body.executionId,
      };
    },
    taint(channel) {
      api.taintSessionFromUntrustedChannel(channel, sessionId, env);
    },
  };
}
