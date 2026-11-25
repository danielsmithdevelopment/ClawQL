/** LangExtract optional extraction layer env ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)). */

import { homedir } from "node:os";
import { join } from "node:path";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function langextractToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_LANGEXTRACT);
}

export function langextractBaseUrl(): string | undefined {
  const raw = process.env.LANGEXTRACT_BASE_URL?.trim();
  return raw || undefined;
}

/** Default local backend — never OpenRouter/DeepSeek unless the operator sets it (audit 4.05). */
export function langextractDefaultModelId(): string {
  return process.env.LANGEXTRACT_MODEL_ID?.trim() || "llama3.2";
}

export function langextractBackend(): string {
  return process.env.LANGEXTRACT_BACKEND?.trim().toLowerCase() || "ollama";
}

export function langextractArtifactsDir(): string {
  const explicit = process.env.LANGEXTRACT_ARTIFACTS_DIR?.trim();
  if (explicit) return explicit;
  const home = process.env.CLAWQL_HOME?.trim();
  if (home) return join(home, "langextract-artifacts");
  return join(homedir(), ".ClawQL", "langextract-artifacts");
}

/** Comma-separated backends the agent may pass per call; empty = ignore agent overrides. */
export function langextractBackendAllowlist(): readonly string[] {
  const raw = process.env.LANGEXTRACT_BACKEND_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Comma-separated model ids the agent may pass per call; empty = ignore agent overrides. */
export function langextractModelAllowlist(): readonly string[] {
  const raw = process.env.LANGEXTRACT_MODEL_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveLangextractBackend(agentBackend?: string): string {
  const configured = langextractBackend();
  const allow = langextractBackendAllowlist();
  const candidate = agentBackend?.trim().toLowerCase();
  if (candidate && allow.includes(candidate)) return candidate;
  return configured;
}

export function resolveLangextractModelId(agentModel?: string): string {
  const configured = langextractDefaultModelId();
  const allow = langextractModelAllowlist();
  const candidate = agentModel?.trim();
  if (candidate && allow.includes(candidate)) return candidate;
  return configured;
}

/** Regulated tier refuses non-local backends unless allowlisted. */
export function assertLangextractBackendAllowed(backend: string): void {
  const tier = process.env.CLAWQL_TIER?.trim().toLowerCase();
  if (tier !== "regulated") return;
  const b = backend.trim().toLowerCase();
  const local = b === "ollama" || b === "local" || b === "none" || b === "demo";
  if (local) return;
  const allow = langextractBackendAllowlist();
  if (allow.includes(b)) return;
  throw new Error(
    `CLAWQL_TIER=regulated refuses LangExtract backend "${backend}"; ` +
      "use ollama/local or set LANGEXTRACT_BACKEND_ALLOWLIST"
  );
}
