/**
 * Bridge from the smoke harness to the real clawql-api native tool gate.
 * Requires `npm run build -w clawql-api` (or a prior workspace build).
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
        const block = await api.gateNativeToolBeforeInvoke({
          toolName,
          args,
          sessionId,
          env,
        });
        if (block) {
          const body = JSON.parse(block.content[0].text);
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

      const block = await api.gateNativeToolBeforeInvoke({
        toolName,
        args,
        sessionId,
        env,
      });
      if (!block) return { blocked: false, detail: "allowed" };
      const body = JSON.parse(block.content[0].text);
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
