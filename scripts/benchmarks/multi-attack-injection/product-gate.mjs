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

  const PASSTHROUGH_SMOKE = new Set(["search", "cache", "audit"]);

  return {
    async invoke(toolName, args) {
      if (PASSTHROUGH_SMOKE.has(toolName)) {
        return { blocked: false, detail: `${toolName}_passthrough_smoke` };
      }

      if (toolName === "skills_list" || toolName === "skills_get") {
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
        return { blocked: false, detail: `${toolName}_allowed` };
      }

      if (toolName === "memory_recall" || toolName === "read_around") {
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
        const plantedText =
          typeof args?.__plantedRecallText === "string" ? args.__plantedRecallText : "";
        api.accumulateNativeToolReadAfterSuccess({
          toolName,
          success: true,
          sessionId,
          env,
          result: plantedText
            ? { content: [{ type: "text", text: plantedText }] }
            : undefined,
        });
        return { blocked: false, detail: "recall_allowed" };
      }

      // Mutating tools — mutate a copy so stamps are visible to the harness.
      const argsCopy =
        args && typeof args === "object" && !Array.isArray(args)
          ? { ...args }
          : args;
      const block = await api.gateNativeToolBeforeInvoke({
        toolName,
        args: argsCopy,
        sessionId,
        env,
      });
      if (!block) {
        return {
          blocked: false,
          detail: "allowed",
          args: argsCopy && typeof argsCopy === "object" ? argsCopy : undefined,
        };
      }
      const body = JSON.parse(block.content[0].text);
      return {
        blocked: true,
        status: body.status,
        mechanism: body.mechanism,
        detail: body.reason ?? body.status,
        executionId: body.executionId,
        args: argsCopy && typeof argsCopy === "object" ? argsCopy : undefined,
      };
    },
    taint(channel) {
      api.taintSessionFromUntrustedChannel(channel, sessionId, env);
    },
    resetSession() {
      if (typeof api.clearAllSessionLabelsSync === "function") {
        api.clearAllSessionLabelsSync();
      }
    },
    peekLabels() {
      if (typeof api.peekSessionLabels === "function") {
        return api.peekSessionLabels(sessionId, env);
      }
      return [];
    },
    taintFromNote(text) {
      if (typeof api.taintSessionFromVaultNoteText === "function") {
        return api.taintSessionFromVaultNoteText(text, sessionId, env);
      }
      return [];
    },
  };
}

/**
 * Passthrough benign context — no gateway. Used for open-weight dual-arm benign
 * so failures that also appear here are model capability, not ClawQL cost.
 *
 * Third-party notify still reports blocked (no public exfil channel on bare vault).
 *
 * @param {string} sessionId
 * @param {NodeJS.ProcessEnv} [_env]
 */
export function makePassthroughBenignInvoke(sessionId, _env) {
  let tainted = false;
  return {
    async invoke(toolName, args) {
      if (toolName === "notify") {
        const dest = String(args?.destination || args?.channel || "");
        const isThirdParty =
          /public-exfil|external|third.?party/i.test(dest) ||
          dest.startsWith("#public");
        if (isThirdParty || (tainted && /exfil/i.test(String(args?.text || "")))) {
          return {
            blocked: true,
            status: "blocked",
            mechanism: "passthrough_no_exfil_channel",
            detail: "passthrough_third_party_notify_unavailable",
          };
        }
        // Same-source / internal — allow on passthrough control.
        return { blocked: false, detail: "passthrough_notify_allowed" };
      }
      if (
        toolName === "memory_ingest" ||
        toolName === "memory_recall" ||
        toolName === "read_around" ||
        toolName === "search" ||
        toolName === "cache" ||
        toolName === "audit" ||
        toolName === "skills_list" ||
        toolName === "skills_get"
      ) {
        return { blocked: false, detail: `${toolName}_passthrough_allowed` };
      }
      return { blocked: false, detail: `${toolName}_passthrough_allowed` };
    },
    taint(_channel) {
      tainted = true;
    },
    resetSession() {
      tainted = false;
    },
    peekLabels() {
      return tainted ? ["untrusted"] : [];
    },
    sessionId,
  };
}
