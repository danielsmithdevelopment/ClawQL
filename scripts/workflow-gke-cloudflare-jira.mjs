#!/usr/bin/env node
/**
 * Multi-provider workflow test: ClawQL `search` across Google (GKE), Cloudflare, and Jira
 * for a realistic end-to-end scenario (offline against bundled specs by default).
 *
 * Scenario (natural-language intent):
 * - Learn how to create a GKE cluster and deploy + expose a service toward Cloudflare IP ranges
 * - Configure Cloudflare DNS + caching for that endpoint
 * - Track work in Jira with assignee, due date, labels, and a detailed description
 *
 * Usage:
 *   npm run build && node scripts/workflow-gke-cloudflare-jira.mjs
 *   npm run workflow:multi-provider
 *
 * Optional — create a real Jira issue (requires tenant + auth):
 *   WORKFLOW_CREATE_JIRA_ISSUE=1 \
 *   CLAWQL_API_BASE_URL=https://YOURSITE.atlassian.net \
 *   CLAWQL_HTTP_HEADERS='{"Authorization":"Basic ..."}' \
 *   WORKFLOW_JIRA_PROJECT_KEY=PROJ \
 *   WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID=... \
 *   node scripts/workflow-gke-cloudflare-jira.mjs
 *
 * Jira Cloud assignee uses **accountId** (find via Jira UI or GET /rest/api/3/user/search).
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PROVIDERS = ["google", "cloudflare", "jira"];

/** Ordered steps: each step runs `search` with the given queries on that provider's spec. */
const WORKFLOW = [
  {
    provider: "google",
    title: "GKE — create / manage clusters",
    queries: [
      "create kubernetes cluster GKE regional zonal",
      "deploy application workload container image kubernetes engine",
    ],
  },
  {
    provider: "google",
    title: "GKE — expose service & network (incl. Cloudflare-friendly ingress)",
    queries: [
      "kubernetes service load balancer external IP expose",
      "compute firewall rule ingress allow tcp source ip range",
      "container clusters get credentials kubectl",
    ],
  },
  {
    provider: "cloudflare",
    title: "Cloudflare — DNS & proxy toward cluster endpoint",
    queries: [
      "create dns record zone A CNAME proxy",
      "list dns records filter name content",
      "load balancer pool origin health check",
    ],
  },
  {
    provider: "cloudflare",
    title: "Cloudflare — caching / performance for HTTP(S) to origin",
    queries: [
      "cache rules cache reserve ttl bypass",
      "zone settings cache always online",
    ],
  },
  {
    provider: "jira",
    title: "Jira — issue tracking for multi-cloud work",
    queries: [
      "create issue project fields summary",
      "assign issue accountId assignee",
      "edit issue labels duedate priority",
      "get create issue metadata createmeta",
    ],
  },
];

const CLOUDFLARE_IP_RANGES_DOC =
  "https://www.cloudflare.com/ips/ (publish IPv4/IPv6 ranges; use on GCP firewall / load balancer allowlists as needed).";

/** Next Friday in local calendar (if today is Friday, the following Friday). */
function nextFridayIso() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 5 Fri
  const target = 5;
  let add = (target - day + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

function plainToAdf(text) {
  const blocks = text.split(/\n\n+/).filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: blocks.map((block) => ({
      type: "paragraph",
      content: [{ type: "text", text: block.replace(/\n/g, " ") }],
    })),
  };
}

async function runSearchWorkflow() {
  process.env.CLAWQL_BUNDLED_OFFLINE = process.env.CLAWQL_BUNDLED_OFFLINE ?? "1";

  const { loadSpec, resetSpecCache } = await import(
    join(ROOT, "dist", "spec-loader.js")
  );
  const { searchOperations } = await import(
    join(ROOT, "dist", "spec-search.js")
  );

  const stepsOut = [];
  const opIndex = new Map();

  for (const step of WORKFLOW) {
    process.env.CLAWQL_PROVIDER = step.provider;
    resetSpecCache();
    const { operations } = await loadSpec();

    const queryResults = [];
    for (const query of step.queries) {
      const hits = searchOperations(operations, query, 5);
      const top = hits.slice(0, 5).map((h) => ({
        score: h.score,
        matchedOn: h.matchedOn,
        operation: {
          id: h.operation.id,
          method: h.operation.method,
          path: h.operation.flatPath,
          description: h.operation.description.slice(0, 280),
        },
      }));
      queryResults.push({ query, hitCount: hits.length, topHits: top });
      for (const t of top) {
        if (!opIndex.has(t.operation.id)) {
          opIndex.set(t.operation.id, {
            provider: step.provider,
            id: t.operation.id,
            method: t.operation.method,
            path: t.operation.flatPath ?? t.operation.path,
          });
        }
      }
    }

    stepsOut.push({
      provider: step.provider,
      title: step.title,
      queries: queryResults,
    });
  }

  const due = nextFridayIso();
  const summary =
    "[Multi-cloud] GKE + Cloudflare DNS/caching — API requests & rollout tracking";

  const descriptionText = [
    `## Goal`,
    `Document the REST/API work to: (1) stand up GKE and deploy a service, (2) expose it in a way compatible with Cloudflare source IPs (${CLOUDFLARE_IP_RANGES_DOC}), (3) point Cloudflare DNS at the cluster/LB endpoint with appropriate caching.`,
    ``,
    `## Due date`,
    `${due} (next Friday, UTC date used for API fields).`,
    ``,
    `## Google Cloud (GKE / networking) — candidate operations (from ClawQL search)`,
    ...[...opIndex.values()]
      .filter((o) => o.provider === "google")
      .slice(0, 12)
      .map((o) => `- \`${o.method}\` ${o.id} — \`${o.path}\``),
    ``,
    `## Cloudflare — candidate operations`,
    ...[...opIndex.values()]
      .filter((o) => o.provider === "cloudflare")
      .slice(0, 12)
      .map((o) => `- \`${o.method}\` ${o.id} — \`${o.path}\``),
    ``,
    `## Jira — candidate operations`,
    ...[...opIndex.values()]
      .filter((o) => o.provider === "jira")
      .slice(0, 8)
      .map((o) => `- \`${o.method}\` ${o.id} — \`${o.path}\``),
    ``,
    `## Notes`,
    `- Use GCP firewall / LB allowlists with Cloudflare published IP ranges where you intend to restrict ingress.`,
    `- Cloudflare: configure DNS (proxied/orange-cloud) and cache rules appropriate for your API vs static assets.`,
    `- Validate Jira \`createmeta\` for required fields before POST /rest/api/3/issue.`,
  ].join("\n");

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      bundledOffline: process.env.CLAWQL_BUNDLED_OFFLINE === "1",
      dueDateNextFriday: due,
      uniqueOperationsConsidered: opIndex.size,
    },
    jiraDraft: {
      summary,
      descriptionPlain: descriptionText,
      descriptionAdf: plainToAdf(descriptionText),
      labels: ["kubernetes", "google", "cloudflare"],
      duedate: due,
    },
    steps: stepsOut,
    uniqueOperations: [...opIndex.values()],
  };
}

async function maybeCreateJiraIssue(draft) {
  if (process.env.WORKFLOW_CREATE_JIRA_ISSUE !== "1") {
    return { skipped: true, reason: "Set WORKFLOW_CREATE_JIRA_ISSUE=1 to POST to Jira" };
  }

  const base =
    process.env.CLAWQL_API_BASE_URL?.replace(/\/$/, "") ||
    process.env.JIRA_SITE?.replace(/\/$/, "");
  const projectKey = process.env.WORKFLOW_JIRA_PROJECT_KEY?.trim();
  const accountId = process.env.WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID?.trim();
  const issueTypeName =
    process.env.WORKFLOW_JIRA_ISSUE_TYPE_NAME?.trim() || "Task";

  if (!base || !projectKey) {
    return {
      skipped: false,
      ok: false,
      error:
        "Missing CLAWQL_API_BASE_URL (or JIRA_SITE) or WORKFLOW_JIRA_PROJECT_KEY",
    };
  }

  let headers = { Accept: "application/json", "Content-Type": "application/json" };
  const raw = process.env.CLAWQL_HTTP_HEADERS;
  if (raw) {
    try {
      Object.assign(headers, JSON.parse(raw));
    } catch {
      return { ok: false, error: "Invalid CLAWQL_HTTP_HEADERS JSON" };
    }
  }

  const labels =
    process.env.WORKFLOW_JIRA_LABELS?.split(/[\s,]+/).filter(Boolean) ||
    draft.labels;

  const fields = {
    project: { key: projectKey },
    summary: draft.summary,
    description: draft.descriptionAdf,
    duedate: draft.duedate,
    labels,
    issuetype: { name: issueTypeName },
  };

  if (accountId) {
    fields.assignee = { accountId };
  }

  const body = { fields };

  const url = `${base}/rest/api/3/issue`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${text}` };
  }
  return { ok: true, data: json };
}

async function main() {
  const report = await runSearchWorkflow();

  console.log("=== ClawQL multi-provider workflow (search-only) ===\n");
  console.log(`Providers: ${PROVIDERS.join(", ")}`);
  console.log(`Unique operations indexed (cumulative): ${report.meta.uniqueOperationsConsidered}`);
  console.log(`Draft due date (next Friday): ${report.meta.dueDateNextFriday}\n`);

  for (const step of report.steps) {
    console.log(`--- [${step.provider.toUpperCase()}] ${step.title} ---`);
    for (const qr of step.queries) {
      console.log(`\n  Query: "${qr.query}" (${qr.hitCount} hits)`);
      for (let i = 0; i < qr.topHits.length; i++) {
        const t = qr.topHits[i];
        const o = t.operation;
        console.log(
          `    ${i + 1}. ${o.method} ${o.id}\n       ${o.path}\n       score=${t.score} [${t.matchedOn.join(", ")}]`
        );
      }
    }
    console.log("");
  }

  const outPath = join(ROOT, "docs", "workflow-multi-provider-latest.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.error(`Wrote structured report: ${outPath}\n`);

  console.log("--- Jira draft (summary) ---");
  console.log(report.jiraDraft.summary);
  console.log("\n--- Jira draft (description, plain excerpt) ---");
  console.log(report.jiraDraft.descriptionPlain.slice(0, 1200));
  console.log(report.jiraDraft.descriptionPlain.length > 1200 ? "\n… [truncated]\n" : "\n");

  const jiraResult = await maybeCreateJiraIssue(report.jiraDraft);
  console.log("--- Jira API ---");
  console.log(JSON.stringify(jiraResult, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        exit: "success",
        reportPath: outPath,
        jira: jiraResult,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
