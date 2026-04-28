#!/usr/bin/env node
/**
 * Download bundled provider specs into providers/ (for offline installs / pinned copies).
 * Requires network. Run from repo root: node scripts/providers/fetch-provider-specs.mjs
 *
 * Self-hosted document APIs (optional — only when env base URLs are set):
 *   PAPERLESS_BASE_URL  → providers/paperless/openapi.yaml (from /api/schema/)
 *   STIRLING_BASE_URL   → providers/stirling/openapi.yaml (from /v3/api-docs)
 *   TIKA_BASE_URL       → providers/tika/openapi.yaml (from /openapi.json when available)
 *   GOTENBERG_BASE_URL  → providers/gotenberg/openapi.yaml (from /openapi.json when available)
 *   ONYX_BASE_URL       → providers/onyx/openapi.yaml (from /openapi.json; optional Bearer via ONYX_API_TOKEN / CLAWQL_ONYX_API_TOKEN)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
  const base = process.env.PAPERLESS_BASE_URL?.trim();
  if (!base) {
    process.stderr.write("Skip paperless: PAPERLESS_BASE_URL unset\n");
    return;
  }
  const schemaUrl = `${base.replace(/\/$/, "")}/api/schema/`;
  process.stderr.write(`Fetching paperless (live) → providers/paperless/openapi.yaml\n`);
  const res = await fetch(schemaUrl, {
    headers: {
      Accept: "application/vnd.oai.openapi+json, application/yaml, application/json, */*",
    },
  });
  if (!res.ok) {
    throw new Error(`paperless: HTTP ${res.status} ${schemaUrl}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  const out = join(root, "providers/paperless/openapi.yaml");
  await mkdir(dirname(out), { recursive: true });
  if (ct.includes("json") || text.trim().startsWith("{")) {
    const { default: YAML } = await import("yaml");
    const obj = JSON.parse(text);
    await writeFile(out, YAML.stringify(obj), "utf-8");
  } else {
    await writeFile(out, text, "utf-8");
  }
}

async function fetchStirlingFromInstance() {
  const base = process.env.STIRLING_BASE_URL?.trim();
  if (!base) {
    process.stderr.write("Skip stirling: STIRLING_BASE_URL unset\n");
    return;
  }
  const docUrl = `${base.replace(/\/$/, "")}/v3/api-docs`;
  process.stderr.write(`Fetching stirling (live) → providers/stirling/openapi.yaml\n`);
  const res = await fetch(docUrl);
  if (!res.ok) {
    throw new Error(`stirling: HTTP ${res.status} ${docUrl}`);
  }
  const text = await res.text();
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

async function fetchTikaOpenApiFromInstance() {
  const base = process.env.TIKA_BASE_URL?.trim();
  if (!base) {
    process.stderr.write("Skip tika live OpenAPI: TIKA_BASE_URL unset (bundled minimal spec kept)\n");
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
    "tika: no /openapi.json or /swagger.json on this server — keeping bundled minimal spec\n"
  );
}

async function fetchGotenbergOpenApiFromInstance() {
  const base = process.env.GOTENBERG_BASE_URL?.trim();
  if (!base) {
    process.stderr.write(
      "Skip gotenberg live OpenAPI: GOTENBERG_BASE_URL unset (bundled minimal spec kept)\n"
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
  process.stderr.write(
    "gotenberg: no OpenAPI JSON/YAML on this server — keeping bundled minimal spec\n"
  );
}

async function fetchOnyxOpenApiFromInstance() {
  const base = process.env.ONYX_BASE_URL?.trim();
  if (!base) {
    process.stderr.write("Skip onyx live OpenAPI: ONYX_BASE_URL unset (bundled minimal spec kept)\n");
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
  await fetchPaperlessFromInstance();
  await fetchStirlingFromInstance();
  await fetchTikaOpenApiFromInstance();
  await fetchGotenbergOpenApiFromInstance();
  await fetchOnyxOpenApiFromInstance();
  process.stderr.write("Done.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
