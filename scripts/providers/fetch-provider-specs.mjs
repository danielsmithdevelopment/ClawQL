#!/usr/bin/env node
/**
 * Download bundled provider specs into providers/ (for offline installs / pinned copies).
 * Requires network. Run from repo root: `npm run fetch-provider-specs` (loads repo `.env` / `.env.local` first).
 *
 * Self-hosted document APIs (Paperless, Stirling, Tika, Gotenberg, Onyx):
 *   - Loads **`${repo}/.env`** then **`${repo}/.env.local`** (override) so you do not need `export` before npm.
 *   - If a base URL env is still unset, uses **local Docker Desktop / Istio hostnames** (`http://*.localhost`)
 *     unless **`CLAWQL_FETCH_PROVIDER_SPECS_LOCALHOST_DEFAULTS=0`**.
 *   - To skip every self-hosted fetch (public bundles only): **`CLAWQL_FETCH_PROVIDER_SPECS_SKIP_SELF_HOSTED=1`**.
 *
 *   PAPERLESS_BASE_URL  → providers/paperless/openapi.yaml (from `/api/schema/` on **Paperless-ngx ≥ 2.15**; older images redirect to login). Auth: **PAPERLESS_API_TOKEN** / **`CLAWQL_PAPERLESS_API_TOKEN`**, else **`paperless-api-token`** from the doc-pipeline Secret via kubectl, else **`clawql-local-paperless-dev`** on localhost (use a real DRF token from Profile or **`POST /api/token/`**). If the host still returns HTML, **in-cluster** `kubectl run … curl` to the Paperless Service. Disable k8s helpers with **`CLAWQL_FETCH_PAPERLESS_K8S_TOKEN=0`**.
 *   STIRLING_BASE_URL   → providers/stirling/openapi.yaml (Stirling-PDF uses **`/v1/api-docs`** per upstream `springdoc.api-docs.path`; script tries **`STIRLING_OPENAPI_PATHS`** or `/v1/api-docs` then `/v3/api-docs`). Optional **STIRLING_API_KEY**; localhost default key matches charts/clawql-mcp values-docker-desktop. Rejects HTML / non-OpenAPI bodies. On **401/403** or failed host attempts for stirling.localhost, tries **in-cluster** `kubectl run … curl` (**`CLAWQL_FETCH_STIRLING_K8S_FALLBACK=0`** disables).
 *   TIKA_BASE_URL       → providers/tika/openapi.yaml (from `/openapi.json` when the server exposes it; otherwise the repo ships a **full JAX-RS surface** spec for Tika Server 2.9.x — there is no upstream OpenAPI URL)
 *   GOTENBERG_BASE_URL  → providers/gotenberg/openapi.yaml (from `/openapi.json` when available; else pins **Gotenberg v7.10.0** `docs/openapi.yaml` — override with **`GOTENBERG_OPENAPI_PIN_URL`**)
 *   ONYX_BASE_URL       → providers/onyx/openapi.yaml (from /openapi.json; optional Bearer via ONYX_API_TOKEN / CLAWQL_ONYX_API_TOKEN)
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const envMain = join(root, ".env");
const envLocal = join(root, ".env.local");
if (existsSync(envMain)) {
  dotenv.config({ path: envMain });
}
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal, override: true });
}

/** Same hostnames as charts/clawql-mcp values-docker-desktop.yaml `providerIngress.*.host` + Istio VS. */
const LOCALHOST_SELF_HOSTED_DEFAULTS = {
  PAPERLESS_BASE_URL: "http://paperless.localhost",
  STIRLING_BASE_URL: "http://stirling.localhost",
  TIKA_BASE_URL: "http://tika.localhost",
  GOTENBERG_BASE_URL: "http://gotenberg.localhost",
  ONYX_BASE_URL: "http://onyx.localhost/api",
};

const CHART_LOCAL_STIRLING_API_KEY = "clawql-local-stirling-dev";
/** Same default as `charts/clawql-mcp/values-docker-desktop.yaml` → `documentPipeline.paperless.auth.apiToken`. */
const CHART_LOCAL_PAPERLESS_API_TOKEN = "clawql-local-paperless-dev";

function selfHostedBlockSkipped() {
  return /^1|true|yes$/i.test(process.env.CLAWQL_FETCH_PROVIDER_SPECS_SKIP_SELF_HOSTED?.trim() ?? "");
}

function localhostDefaultsDisabled() {
  const v = process.env.CLAWQL_FETCH_PROVIDER_SPECS_LOCALHOST_DEFAULTS?.trim();
  return v === "0" || /^false|no$/i.test(v ?? "");
}

/**
 * @param {keyof typeof LOCALHOST_SELF_HOSTED_DEFAULTS} envKey
 */
function resolveSelfHostedBaseUrl(envKey) {
  const explicit = process.env[envKey]?.trim();
  if (explicit) {
    return explicit;
  }
  if (localhostDefaultsDisabled()) {
    return "";
  }
  return LOCALHOST_SELF_HOSTED_DEFAULTS[envKey];
}

function isLikelyLocalStirlingBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.hostname === "stirling.localhost" || u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

/** Stirling-PDF `application.properties`: `springdoc.api-docs.path=/v1/api-docs` (not `/v3/api-docs`). */
function stirlingOpenApiPathCandidates() {
  const raw = process.env.STIRLING_OPENAPI_PATHS?.trim();
  if (raw) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["/v1/api-docs", "/v3/api-docs"];
}

function stirlingApiKeyForFetch(baseUrl) {
  const fromEnv =
    process.env.STIRLING_API_KEY?.trim() || process.env.CLAWQL_STIRLING_API_KEY?.trim() || "";
  if (fromEnv) {
    return fromEnv;
  }
  if (isLikelyLocalStirlingBaseUrl(baseUrl)) {
    return CHART_LOCAL_STIRLING_API_KEY;
  }
  return "";
}

function stirlingKubectlFallbackDisabled() {
  const v = process.env.CLAWQL_FETCH_STIRLING_K8S_FALLBACK?.trim();
  return v === "0" || /^false|no$/i.test(v ?? "");
}

function kubectlClientAvailable() {
  const r = spawnSync("kubectl", ["version", "--client=true"], { encoding: "utf8" });
  return r.status === 0;
}

function stirlingK8sNamespace() {
  return (
    process.env.CLAWQL_FETCH_K8S_NAMESPACE?.trim() ||
    process.env.CLAWQL_TARGET_NAMESPACE?.trim() ||
    "clawql"
  );
}

function stirlingK8sServiceDnsName() {
  const svc =
    process.env.CLAWQL_FETCH_STIRLING_K8S_SERVICE?.trim() || "clawql-mcp-http-stirling";
  const ns = stirlingK8sNamespace();
  return `${svc}.${ns}.svc.cluster.local`;
}

function stirlingDocPipelineSecretName() {
  return (
    process.env.CLAWQL_FETCH_STIRLING_K8S_SECRET_NAME?.trim() ||
    "clawql-mcp-http-doc-pipeline-auth"
  );
}

function stirlingK8sServicePort() {
  const p = process.env.CLAWQL_FETCH_STIRLING_K8S_PORT?.trim();
  return p && /^\d+$/.test(p) ? p : "8080";
}

function paperlessK8sTokenFallbackDisabled() {
  const v = process.env.CLAWQL_FETCH_PAPERLESS_K8S_TOKEN?.trim();
  return v === "0" || /^false|no$/i.test(v ?? "");
}

function isLikelyLocalPaperlessBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return (
      u.hostname === "paperless.localhost" || u.hostname === "127.0.0.1" || u.hostname === "localhost"
    );
  } catch {
    return false;
  }
}

/** Same Secret as Stirling (`…-doc-pipeline-auth`); key `paperless-api-token` when Helm sets `documentPipeline.paperless.auth.apiToken`. */
function readPaperlessApiTokenFromKubectlSecret() {
  if (paperlessK8sTokenFallbackDisabled() || !kubectlClientAvailable()) {
    return "";
  }
  const ns = stirlingK8sNamespace();
  const secret = stirlingDocPipelineSecretName();
  const r = spawnSync(
    "kubectl",
    ["get", "secret", secret, "-n", ns, "-o", "jsonpath={.data.paperless-api-token}"],
    { encoding: "utf8" }
  );
  if (r.status !== 0 || !r.stdout?.trim()) {
    return "";
  }
  try {
    return Buffer.from(r.stdout.trim(), "base64").toString("utf8").trim() || "";
  } catch {
    return "";
  }
}

function paperlessApiTokenForFetch(baseUrl) {
  const fromEnv =
    process.env.PAPERLESS_API_TOKEN?.trim() || process.env.CLAWQL_PAPERLESS_API_TOKEN?.trim() || "";
  if (fromEnv) {
    return fromEnv;
  }
  if (!isLikelyLocalPaperlessBaseUrl(baseUrl)) {
    return "";
  }
  const fromK8s = readPaperlessApiTokenFromKubectlSecret();
  if (fromK8s) {
    process.stderr.write(
      "paperless: PAPERLESS_API_TOKEN unset — using paperless-api-token from cluster doc-pipeline Secret\n"
    );
    return fromK8s;
  }
  process.stderr.write(
    "paperless: no PAPERLESS_API_TOKEN in env / Secret — using chart docker-desktop default (clawql-local-paperless-dev); ensure Helm has documentPipeline.paperless.auth.apiToken and Paperless has rolled out\n"
  );
  return CHART_LOCAL_PAPERLESS_API_TOKEN;
}

function paperlessK8sServiceDns() {
  const svc = process.env.CLAWQL_FETCH_PAPERLESS_K8S_SERVICE?.trim() || "clawql-mcp-http-paperless";
  const ns = stirlingK8sNamespace();
  return `${svc}.${ns}.svc.cluster.local`;
}

function paperlessK8sServicePort() {
  const p = process.env.CLAWQL_FETCH_PAPERLESS_K8S_PORT?.trim();
  return p && /^\d+$/.test(p) ? p : "8000";
}

/**
 * @param {string} apiToken raw token (no "Token " prefix)
 * @returns {string | null}
 */
function tryFetchPaperlessSchemaViaKubectl(apiToken) {
  if (paperlessK8sTokenFallbackDisabled() || !kubectlClientAvailable() || !apiToken?.trim()) {
    return null;
  }
  const ns = stirlingK8sNamespace();
  const host = paperlessK8sServiceDns();
  const port = paperlessK8sServicePort();
  const innerUrl = `http://${host}:${port}/api/schema/`;
  const pod = `paperless-schema-${randomBytes(4).toString("hex")}`;
  const authVal = /^token\s+/i.test(apiToken) ? apiToken : `Token ${apiToken.trim()}`;
  process.stderr.write(`paperless: trying in-cluster GET ${innerUrl} (kubectl run ${pod})\n`);
  const args = [
    "run",
    pod,
    "--rm",
    "-n",
    ns,
    "--restart=Never",
    `--pod-running-timeout=3m`,
    "-i",
    "--image=curlimages/curl:8.5.0",
    "--",
    "curl",
    "-sS",
    "-H",
    `Authorization: ${authVal}`,
    "-H",
    "Accept: application/vnd.oai.openapi+json, application/json, application/yaml, */*",
    "-w",
    "\n__CLAWQL_HTTP_STATUS:%{http_code}\n",
    innerUrl,
  ];
  const r = spawnSync("kubectl", args, {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    process.stderr.write(`paperless: in-cluster schema fetch failed${err ? `: ${err}` : ""}\n`);
    return null;
  }
  const raw = r.stdout ?? "";
  const m = raw.match(/\n__CLAWQL_HTTP_STATUS:(\d+)\s*$/);
  const http = m ? m[1] : "";
  const body = (m ? raw.slice(0, m.index) : raw).trimEnd();
  if (http && http !== "200") {
    process.stderr.write(`paperless: in-cluster GET returned HTTP ${http}${http === "302" ? " (often SPA login when Paperless is < 2.15 — no `/api/schema/` yet; bump Helm `documentPipeline.paperless.image.tag` to 2.15.0+)" : ""}\n`);
  }
  return body || null;
}

function readStirlingApiKeyFromKubectlSecret() {
  const ns = stirlingK8sNamespace();
  const secret = stirlingDocPipelineSecretName();
  const r = spawnSync(
    "kubectl",
    ["get", "secret", secret, "-n", ns, "-o", "jsonpath={.data.stirling-api-key}"],
    { encoding: "utf8" }
  );
  if (r.status !== 0 || !r.stdout?.trim()) {
    return "";
  }
  try {
    return Buffer.from(r.stdout.trim(), "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

/**
 * Fetch OpenAPI JSON from the Stirling Service DNS inside the cluster (same paths as host).
 * @returns {string | null} raw body or null
 */
function tryFetchStirlingApiDocsViaKubectl() {
  if (stirlingKubectlFallbackDisabled() || !kubectlClientAvailable()) {
    return null;
  }
  const ns = stirlingK8sNamespace();
  const host = stirlingK8sServiceDnsName();
  const port = stirlingK8sServicePort();
  const key =
    readStirlingApiKeyFromKubectlSecret() ||
    process.env.STIRLING_API_KEY?.trim() ||
    process.env.CLAWQL_STIRLING_API_KEY?.trim() ||
    CHART_LOCAL_STIRLING_API_KEY;

  for (const path of stirlingOpenApiPathCandidates()) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const innerUrl = `http://${host}:${port}${p}`;
    const pod = `stirling-openapi-${randomBytes(4).toString("hex")}`;
    process.stderr.write(`stirling: in-cluster curl → ${innerUrl} (kubectl run ${pod})\n`);
    const args = [
      "run",
      pod,
      "--rm",
      "-n",
      ns,
      "--restart=Never",
      `--pod-running-timeout=3m`,
      "-i",
      "--image=curlimages/curl:8.5.0",
      "--",
      "curl",
      "-sS",
      "-f",
      "-H",
      `X-API-KEY: ${key}`,
      innerUrl,
    ];
    const r = spawnSync("kubectl", args, {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.status !== 0) {
      const err = (r.stderr || r.stdout || "").trim();
      process.stderr.write(`stirling: in-cluster ${p} failed${err ? `: ${err}` : ""}\n`);
      continue;
    }
    const body = r.stdout ?? "";
    const v = validateStirlingOpenApiBody(body, "application/json");
    if (!v.ok) {
      process.stderr.write(`stirling: in-cluster ${p} rejected: ${v.reason}\n`);
      continue;
    }
    return body;
  }
  return null;
}

/**
 * Reject login pages / SPA HTML mistaken for OpenAPI when fetching `/api/schema/` etc.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateOpenApiFetchBody(text, contentType) {
  const t = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") && !ct.includes("json") && !ct.includes("yaml")) {
    return {
      ok: false,
      reason:
        "Content-Type is HTML, not OpenAPI (unauthenticated Paperless redirects /api/schema/ to the login page — set PAPERLESS_API_TOKEN)",
    };
  }
  if (!t) {
    return { ok: false, reason: "empty response body" };
  }
  if (t.startsWith("<") || /^<!doctype/i.test(t)) {
    return {
      ok: false,
      reason: "body is HTML, not OpenAPI (login page or wrong URL — use Token auth for /api/schema/)",
    };
  }
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t);
      if (o && typeof o === "object") {
        if (typeof o.openapi === "string" && o.openapi.startsWith("3")) {
          return { ok: true };
        }
        if (o.swagger === "2.0") {
          return { ok: true };
        }
        const rec = o;
        if (typeof rec.rootUrl === "string" && rec.resources != null && !("openapi" in rec) && !("swagger" in rec)) {
          return { ok: true };
        }
      }
      return { ok: false, reason: "JSON is not OpenAPI 3.x, Swagger 2.0, or Google Discovery" };
    } catch (e) {
      return { ok: false, reason: `invalid JSON: ${/** @type {Error} */ (e).message}` };
    }
  }
  /** Paperless / drf-spectacular often returns YAML with `---`, comments, or indented `openapi:` — avoid brittle line-1-only checks. */
  const tBody = t.replace(/^(---\s*\r?\n)+/, "").trim();
  const head = tBody.slice(0, 16384);
  if (
    !tBody.startsWith("<") &&
    /(^|[\r\n])[\s#-]*openapi:\s*(["']?)(3[\d.]*)\2?/m.test(head)
  ) {
    return { ok: true };
  }
  return { ok: false, reason: "expected OpenAPI 3 JSON or YAML (openapi: 3…)" };
}

/**
 * SpringDoc serves OpenAPI as JSON (`openapi` or legacy `swagger` root field). HTML means the gateway
 * served the SPA index (wrong route) — do not write that to providers/stirling/openapi.yaml.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateStirlingOpenApiBody(text, contentType) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") && !ct.includes("json")) {
    return {
      ok: false,
      reason:
        "Content-Type is HTML, not OpenAPI JSON (wrong path often serves the SPA; Stirling-PDF uses /v1/api-docs per springdoc.api-docs.path)",
    };
  }
  const t = text.trim();
  if (!t) {
    return { ok: false, reason: "empty response body" };
  }
  if (t.startsWith("<") || /^<!doctype/i.test(t)) {
    return { ok: false, reason: "body starts with HTML, not OpenAPI JSON" };
  }
  if (!t.startsWith("{")) {
    return { ok: false, reason: "expected JSON document starting with {" };
  }
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === "object" && (typeof obj.openapi === "string" || typeof obj.swagger === "string")) {
      return { ok: true };
    }
    return { ok: false, reason: "JSON root missing openapi/swagger (not an OpenAPI document)" };
  } catch (e) {
    return { ok: false, reason: `invalid JSON: ${/** @type {Error} */ (e).message}` };
  }
}

async function writeStirlingOpenapiYamlFromText(text) {
  const out = join(root, "providers/stirling/openapi.yaml");
  await mkdir(dirname(out), { recursive: true });
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const { default: YAML } = await import("yaml");
    const obj = JSON.parse(text);
    await writeFile(out, YAML.stringify(obj), "utf-8");
  } else {
    await writeFile(out, text, "utf-8");
  }
}

const TARGETS = [
  {
    id: "google-container-discovery",
    url: "https://container.googleapis.com/$discovery/rest?version=v1",
    out: "providers/google/discovery.json",
  },
  {
    id: "jira",
    url: "https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/jira.yaml",
    out: "providers/atlassian/jira/openapi.yaml",
  },
  {
    id: "bitbucket",
    url: "https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/bitbucket.yaml",
    out: "providers/atlassian/bitbucket/openapi.yaml",
  },
  {
    id: "cloudflare",
    url: "https://raw.githubusercontent.com/cloudflare/api-schemas/refs/heads/main/openapi.yaml",
    out: "providers/cloudflare/openapi.yaml",
  },
  {
    id: "github",
    url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.yaml",
    out: "providers/github/openapi.yaml",
  },
  {
    id: "slack",
    url: "https://api.slack.com/specs/openapi/v2/slack_web.json",
    out: "providers/slack/openapi.json",
  },
  {
    id: "sentry",
    url: "https://raw.githubusercontent.com/getsentry/sentry-api-schema/main/openapi-derefed.json",
    out: "providers/sentry/openapi.json",
  },
];

/**
 * @param {{ id: string, url: string, out: string, headers?: Record<string, string> }} t
 */
async function fetchOne(t) {
  const out = join(root, t.out);
  await mkdir(dirname(out), { recursive: true });
  process.stderr.write(`Fetching ${t.id} → ${t.out}\n`);
  const res = await fetch(t.url, { headers: t.headers ?? {} });
  if (!res.ok) {
    throw new Error(`${t.id}: HTTP ${res.status} ${t.url}`);
  }
  const text = await res.text();
  await writeFile(out, text, "utf-8");
}

async function fetchPaperlessFromInstance() {
  const base = resolveSelfHostedBaseUrl("PAPERLESS_BASE_URL");
  if (!base) {
    process.stderr.write(
      "Skip paperless: set PAPERLESS_BASE_URL or enable localhost defaults (unset CLAWQL_FETCH_PROVIDER_SPECS_LOCALHOST_DEFAULTS)\n"
    );
    return;
  }
  const schemaUrl = `${base.replace(/\/$/, "")}/api/schema/`;
  process.stderr.write(`Fetching paperless (live) → providers/paperless/openapi.yaml\n`);
  const tok = paperlessApiTokenForFetch(base);
  const headers = {
    Accept: "application/vnd.oai.openapi+json, application/yaml, application/json, */*",
    ...(tok
      ? {
          Authorization: /^token\s+/i.test(tok) ? tok : `Token ${tok}`,
        }
      : {}),
  };
  const res = await fetch(schemaUrl, { headers });
  if (!res.ok) {
    throw new Error(`paperless: HTTP ${res.status} ${schemaUrl}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let bodyOk = validateOpenApiFetchBody(text, ct);
  let effectiveText = text;
  let effectiveCt = ct;
  if (!bodyOk.ok && isLikelyLocalPaperlessBaseUrl(base)) {
    const curlTok =
      readPaperlessApiTokenFromKubectlSecret() || tok || CHART_LOCAL_PAPERLESS_API_TOKEN;
    const viaK8s = tryFetchPaperlessSchemaViaKubectl(curlTok);
    if (viaK8s) {
      const v2 = validateOpenApiFetchBody(viaK8s, "application/json");
      if (v2.ok) {
        effectiveText = viaK8s;
        effectiveCt = "application/json";
        bodyOk = v2;
      } else {
        process.stderr.write(`paperless: in-cluster body rejected: ${v2.reason}\n`);
      }
    }
  }
  if (!bodyOk.ok) {
    const parts = [];
    if (isLikelyLocalPaperlessBaseUrl(base)) {
      parts.push(
        "For Docker Desktop: `helm upgrade` with `documentPipeline.paperless.auth.apiToken` (see values-docker-desktop), `kubectl rollout restart deployment/…-paperless`, then re-fetch; or set **PAPERLESS_API_TOKEN** in `.env` to a token from Paperless (Profile → API token / `POST /api/token/`)."
      );
    }
    parts.push(
      "Paperless before v2.15 does not expose OpenAPI at `/api/schema/` (you get a login redirect); set **`documentPipeline.paperless.image.tag`** to **2.15.0** or newer."
    );
    throw new Error(`paperless: ${bodyOk.reason} (${schemaUrl}) ${parts.join(" ")}`);
  }
  const out = join(root, "providers/paperless/openapi.yaml");
  await mkdir(dirname(out), { recursive: true });
  if (effectiveCt.includes("json") || effectiveText.trim().startsWith("{")) {
    const { default: YAML } = await import("yaml");
    const obj = JSON.parse(effectiveText);
    await writeFile(out, YAML.stringify(obj), "utf-8");
  } else {
    await writeFile(out, effectiveText, "utf-8");
  }
}

async function fetchStirlingFromInstance() {
  const base = resolveSelfHostedBaseUrl("STIRLING_BASE_URL");
  if (!base) {
    process.stderr.write(
      "Skip stirling: set STIRLING_BASE_URL or enable localhost defaults (unset CLAWQL_FETCH_PROVIDER_SPECS_LOCALHOST_DEFAULTS)\n"
    );
    return;
  }
  const baseNorm = base.replace(/\/$/, "");
  process.stderr.write(`Fetching stirling (live) → providers/stirling/openapi.yaml (${base})\n`);
  const baseHeaders = {
    Accept: "application/json, application/yaml, application/vnd.oai.openapi+json, */*",
  };

  let lastFailure = "";
  for (const path of stirlingOpenApiPathCandidates()) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const docUrl = `${baseNorm}${p}`;
    let apiKey = stirlingApiKeyForFetch(base);
    let headers = { ...baseHeaders, ...(apiKey ? { "X-API-KEY": apiKey } : {}) };
    let res = await fetch(docUrl, { headers });
    if (res.status === 401 && apiKey && apiKey !== CHART_LOCAL_STIRLING_API_KEY && isLikelyLocalStirlingBaseUrl(base)) {
      process.stderr.write(
        `stirling: ${p} HTTP 401 — retrying with chart local default API key (override STIRLING_API_KEY if your cluster differs)\n`
      );
      apiKey = CHART_LOCAL_STIRLING_API_KEY;
      headers = { ...baseHeaders, "X-API-KEY": apiKey };
      res = await fetch(docUrl, { headers });
    }

    if (!res.ok) {
      lastFailure = `${docUrl} → HTTP ${res.status}`;
      process.stderr.write(`stirling: ${lastFailure}\n`);
      if ((res.status === 401 || res.status === 403) && isLikelyLocalStirlingBaseUrl(base)) {
        const viaK8s = tryFetchStirlingApiDocsViaKubectl();
        if (viaK8s) {
          await writeStirlingOpenapiYamlFromText(viaK8s);
          process.stderr.write("Wrote providers/stirling/openapi.yaml from in-cluster OpenAPI path\n");
          return;
        }
      }
      continue;
    }

    const text = await res.text();
    const ct = res.headers.get("content-type") ?? "";
    const bodyValid = validateStirlingOpenApiBody(text, ct);
    if (bodyValid.ok) {
      await writeStirlingOpenapiYamlFromText(text);
      process.stderr.write(`Wrote providers/stirling/openapi.yaml from ${docUrl}\n`);
      return;
    }
    lastFailure = `${docUrl}: ${bodyValid.reason}`;
    process.stderr.write(`stirling: ${lastFailure}\n`);
  }

  if (isLikelyLocalStirlingBaseUrl(base)) {
    process.stderr.write("stirling: host paths failed — trying in-cluster curl (same path list)\n");
    const viaK8s = tryFetchStirlingApiDocsViaKubectl();
    if (viaK8s) {
      await writeStirlingOpenapiYamlFromText(viaK8s);
      process.stderr.write("Wrote providers/stirling/openapi.yaml from in-cluster OpenAPI path\n");
      return;
    }
  }

  const hint =
    " Stirling-PDF exposes OpenAPI at /v1/api-docs (see upstream application.properties). Set STIRLING_OPENAPI_PATHS if your image differs.";
  throw new Error(`stirling: could not fetch OpenAPI JSON from ${baseNorm} (${lastFailure || "no paths tried"})${hint}`);
}

async function fetchTikaOpenApiFromInstance() {
  const base = resolveSelfHostedBaseUrl("TIKA_BASE_URL");
  if (!base) {
    process.stderr.write(
      "Skip tika live OpenAPI: set TIKA_BASE_URL or enable localhost defaults (bundled spec kept)\n"
    );
    return;
  }
  const candidates = ["/openapi.json", "/openapi.yaml", "/swagger.json"];
  for (const path of candidates) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    process.stderr.write(`Trying tika OpenAPI ${url}\n`);
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      const out = join(root, "providers/tika/openapi.yaml");
      await mkdir(dirname(out), { recursive: true });
      const trimmed = text.trim();
      if (path.endsWith(".json") || trimmed.startsWith("{")) {
        const { default: YAML } = await import("yaml");
        const obj = JSON.parse(text);
        await writeFile(out, YAML.stringify(obj), "utf-8");
      } else {
        await writeFile(out, text, "utf-8");
      }
      process.stderr.write(`Wrote providers/tika/openapi.yaml from ${url}\n`);
      return;
    }
  }
  process.stderr.write(
    "tika: no /openapi.json or /swagger.json on this server — keeping bundled OpenAPI (JAX-RS surfaces for Tika Server 2.9.x)\n"
  );
}

async function fetchGotenbergOpenApiFromInstance() {
  const base = resolveSelfHostedBaseUrl("GOTENBERG_BASE_URL");
  if (!base) {
    process.stderr.write(
      "Skip gotenberg live OpenAPI: set GOTENBERG_BASE_URL or enable localhost defaults (bundled spec kept)\n"
    );
    return;
  }
  const candidates = ["/openapi.json", "/openapi.yaml", "/swagger.json"];
  for (const path of candidates) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    process.stderr.write(`Trying gotenberg OpenAPI ${url}\n`);
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      const out = join(root, "providers/gotenberg/openapi.yaml");
      await mkdir(dirname(out), { recursive: true });
      const trimmed = text.trim();
      if (path.endsWith(".json") || trimmed.startsWith("{")) {
        const { default: YAML } = await import("yaml");
        const obj = JSON.parse(text);
        await writeFile(out, YAML.stringify(obj), "utf-8");
      } else {
        await writeFile(out, text, "utf-8");
      }
      process.stderr.write(`Wrote providers/gotenberg/openapi.yaml from ${url}\n`);
      return;
    }
  }
  const pinUrl =
    process.env.GOTENBERG_OPENAPI_PIN_URL?.trim() ||
    "https://raw.githubusercontent.com/gotenberg/gotenberg/v7.10.0/docs/openapi.yaml";
  process.stderr.write(
    `gotenberg: no /openapi.json on server — fetching pinned upstream spec (${pinUrl})\n`
  );
  const res = await fetch(pinUrl);
  if (!res.ok) {
    process.stderr.write(`gotenberg: pinned fetch failed HTTP ${res.status} — keeping repo file\n`);
    return;
  }
  const text = await res.text();
  const out = join(root, "providers/gotenberg/openapi.yaml");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, text, "utf-8");
  process.stderr.write(`Wrote providers/gotenberg/openapi.yaml from ${pinUrl}\n`);
}

async function fetchOnyxOpenApiFromInstance() {
  const base = resolveSelfHostedBaseUrl("ONYX_BASE_URL");
  if (!base) {
    process.stderr.write(
      "Skip onyx live OpenAPI: set ONYX_BASE_URL or enable localhost defaults (bundled minimal spec kept)\n"
    );
    return;
  }
  const token =
    process.env.ONYX_API_TOKEN?.trim() || process.env.CLAWQL_ONYX_API_TOKEN?.trim() || "";
  const headers = {
    Accept: "application/json, application/yaml, application/vnd.oai.openapi+json, */*",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const candidates = ["/openapi.json", "/openapi.yaml"];
  for (const path of candidates) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    process.stderr.write(`Trying onyx OpenAPI ${url}\n`);
    const res = await fetch(url, { headers });
    if (res.ok) {
      const text = await res.text();
      const out = join(root, "providers/onyx/openapi.yaml");
      await mkdir(dirname(out), { recursive: true });
      const trimmed = text.trim();
      if (path.endsWith(".json") || trimmed.startsWith("{")) {
        const { default: YAML } = await import("yaml");
        const obj = JSON.parse(text);
        await writeFile(out, YAML.stringify(obj), "utf-8");
      } else {
        await writeFile(out, text, "utf-8");
      }
      process.stderr.write(`Wrote providers/onyx/openapi.yaml from ${url}\n`);
      process.stderr.write(
        "onyx: upstream OpenAPI can be very large — trim or replace with a minimal subset before committing if CI/build regress.\n"
      );
      return;
    }
  }
  process.stderr.write(
    "onyx: no /openapi.json or /openapi.yaml on this server — keeping bundled minimal spec\n"
  );
}

async function main() {
  for (const t of TARGETS) {
    await fetchOne(t);
  }
  if (selfHostedBlockSkipped()) {
    process.stderr.write(
      "Skip self-hosted document specs (CLAWQL_FETCH_PROVIDER_SPECS_SKIP_SELF_HOSTED=1): paperless, stirling, tika, gotenberg, onyx\n"
    );
  } else {
    await fetchPaperlessFromInstance();
    await fetchStirlingFromInstance();
    await fetchTikaOpenApiFromInstance();
    await fetchGotenbergOpenApiFromInstance();
    await fetchOnyxOpenApiFromInstance();
  }
  process.stderr.write("Done.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
