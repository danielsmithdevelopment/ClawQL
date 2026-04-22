#!/usr/bin/env node
/**
 * Complex multi-provider workflow: full “release stack” scenario across bundled specs.
 *
 * Scenario (natural language → ClawQL `search` per provider):
 * - GKE cluster, Service to expose deployment, GCP firewall allowlisting Cloudflare IPs
 * - Cloudflare DNS + caching toward the exposed endpoint
 * - Sentry on GKE (default / chart-style setup)
 * - GitHub Actions: daily rebuild + redeploy to GKE
 * - Slack: notify release channel per step
 * - n8n: workflow → create GitHub release when Slack message hits release channel
 * - Jira: one ticket documenting all of the above by tool, assignee + due + priority + labels
 *
 * Uses merged preset **CLAWQL_PROVIDER=all-providers** (Google top50 + every other bundled
 * vendor: Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n) — one `loadSpec()` pass.
 *
 * Usage (offline search against bundled specs by default):
 *   npm run build && npm run workflow:complex-release-stack
 *
 * Real MCP (stdio or HTTP): `npm run workflow:complex-release-stack:mcp` (see that script).
 *
 * Jira dry-run (show POST body, no network to Jira unless you also set create):
 *   WORKFLOW_PREVIEW_JIRA_REQUEST=1 npm run workflow:complex-release-stack
 *
 * Live Jira create (needs tenant + auth + project + assignee accountId):
 *   WORKFLOW_CREATE_JIRA_ISSUE=1 \
 *   CLAWQL_API_BASE_URL=https://YOURSITE.atlassian.net \
 *   CLAWQL_HTTP_HEADERS='{"Authorization":"Basic ..."}' \
 *   WORKFLOW_JIRA_PROJECT_KEY=PROJ \
 *   WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID=... \
 *   npm run workflow:complex-release-stack
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPLEX_RELEASE_STACK_WORKFLOW as WORKFLOW } from "./complex-release-stack-steps.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CLOUDFLARE_IP_RANGES_DOC =
  "https://www.cloudflare.com/ips/ (use published IPv4/IPv6 ranges on GCP firewall / LB allowlists).";

/** Calendar date ISO (YYYY-MM-DD), seven days from today in local time. */
function dueInOneWeekIso() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
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

function operationsForLogicalProvider(allOperations, logicalProvider, openapiLabelSet) {
  if (logicalProvider === "google") {
    return allOperations.filter((o) => !openapiLabelSet.has(o.specLabel ?? ""));
  }
  return allOperations.filter((o) => (o.specLabel ?? "") === logicalProvider);
}

async function runSearchWorkflow() {
  process.env.CLAWQL_BUNDLED_OFFLINE = process.env.CLAWQL_BUNDLED_OFFLINE ?? "1";
  delete process.env.CLAWQL_GOOGLE_TOP50_SPECS;
  process.env.CLAWQL_PROVIDER = "all-providers";

  const { BUNDLED_MERGED_VENDOR_LABELS } = await import(
    join(ROOT, "dist", "provider-registry.js")
  );
  const logicalProviders = ["google", ...BUNDLED_MERGED_VENDOR_LABELS];

  const { loadSpec, resetSpecCache } = await import(
    join(ROOT, "dist", "spec-loader.js")
  );
  const { searchOperations } = await import(
    join(ROOT, "dist", "spec-search.js")
  );

  const openapiLabelSet = new Set(BUNDLED_MERGED_VENDOR_LABELS);

  resetSpecCache();
  const { operations: allOps } = await loadSpec();

  const providerOperationCounts = Object.fromEntries(
    logicalProviders.map((p) => [p, 0])
  );
  for (const op of allOps) {
    const label = op.specLabel ?? "";
    if (openapiLabelSet.has(label)) {
      providerOperationCounts[label] += 1;
    } else {
      providerOperationCounts.google += 1;
    }
  }
  const mergedOperationCount = allOps.length;

  const stepsOut = [];
  const opIndex = new Map();

  for (const step of WORKFLOW) {
    const operations = operationsForLogicalProvider(
      allOps,
      step.provider,
      openapiLabelSet
    );

    const queryResults = [];
    for (const query of step.queries) {
      const hits = searchOperations(operations, query, 5);
      const top = hits.slice(0, 5).map((h) => ({
        score: h.score,
        matchedOn: h.matchedOn,
        operation: {
          id: h.operation.id,
          method: h.operation.method,
          path: h.operation.flatPath ?? h.operation.path,
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
            path: t.operation.path,
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

  const due = dueInOneWeekIso();
  const assigneeDisplay =
    process.env.WORKFLOW_JIRA_ASSIGNEE_DISPLAY_NAME?.trim() || "Daniel Smith";

  const summary =
    "[Release stack] GKE + Cloudflare + Sentry + GitHub Actions + Slack + n8n + Bitbucket — end-to-end runbook";

  const bulletsFor = (prov, limit = 8) =>
    [...opIndex.values()]
      .filter((o) => o.provider === prov)
      .slice(0, limit)
      .map((o) => `- \`${o.method}\` ${o.id} — \`${o.path}\``);

  const descriptionText = [
    `## Assignee`,
    `${assigneeDisplay} — set Jira Cloud **accountId** via WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID for API assignee.`,
    ``,
    `## Due`,
    `${due} (seven days from workflow generation, local calendar date).`,
    ``,
    `## Priority`,
    `High (see Jira API field priority in create payload).`,
    ``,
    `## Goal (orchestration)`,
    `1) Stand up GKE and deploy a service; expose it with a Kubernetes Service.`,
    `2) Restrict ingress on GCP to **Cloudflare published IP ranges** where appropriate (${CLOUDFLARE_IP_RANGES_DOC}).`,
    `3) Cloudflare DNS (proxied) toward the LB/origin; tune **caching** to reduce GKE load.`,
    `4) **Sentry** SDK/chart on the workload with default org/project + release tracking.`,
    `5) **GitHub Actions** pipeline: build container and redeploy to GKE **daily** (schedule + kubectl/gcloud or deploy action).`,
    `6) **Slack** notifications to the **release** channel for each major step (build, deploy, DNS, cache, Sentry verify).`,
    `7) **n8n** workflow: on message in release channel → create an **official GitHub Release** (or tag) via API.`,
    `8) Optionally mirror CI artifacts or PR flow in **Bitbucket** (repos / Pipelines) if your org standardizes on Atlassian.`,
    `9) This Jira ticket tracks the above; labels identify each toolchain.`,
    ``,
    `---`,
    `## Google Cloud (GKE / networking)`,
    ...bulletsFor("google", 14),
    ``,
    `## Cloudflare`,
    ...bulletsFor("cloudflare", 10),
    ``,
    `## Sentry`,
    ...bulletsFor("sentry", 10),
    ``,
    `## GitHub`,
    ...bulletsFor("github", 10),
    ``,
    `## Slack`,
    ...bulletsFor("slack", 8),
    ``,
    `## n8n`,
    ...bulletsFor("n8n", 8),
    ``,
    `## Bitbucket`,
    ...bulletsFor("bitbucket", 8),
    ``,
    `## Jira (meta)`,
    ...bulletsFor("jira", 6),
    ``,
    `## Notes`,
    `- ClawQL \`search\` results above are **candidates** from bundled OpenAPI; validate paths/versions before calling live APIs.`,
    `- n8n: design workflow with Slack trigger + GitHub “create release” HTTP node or GitHub app token.`,
    `- GitHub Actions: use OIDC to GCP where possible; avoid long-lived keys in secrets.`,
  ].join("\n");

  const labels = [
    "google-cloud",
    "cloudflare",
    "sentry",
    "github-actions",
    "slack",
    "n8n",
    "bitbucket",
    "release-channel",
    "firewall-allowlist",
  ];

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      clawqlProviderPreset: "all-providers",
      logicalProviders,
      scenario:
        "GKE + expose service + GCP firewall (Cloudflare IPs) + CF DNS/cache + Sentry + GH Actions daily deploy + Slack + n8n → GitHub release + Jira (+ Bitbucket in bundled all-providers preset)",
      bundledOffline: process.env.CLAWQL_BUNDLED_OFFLINE === "1",
      dueDateOneWeek: due,
      assigneeDisplayName: assigneeDisplay,
      mergedOperationCount,
      providerOperationCounts,
      uniqueOperationsConsidered: opIndex.size,
    },
    jiraDraft: {
      summary,
      descriptionPlain: descriptionText,
      descriptionAdf: plainToAdf(descriptionText),
      labels,
      duedate: due,
      priorityName: "High",
    },
    steps: stepsOut,
    uniqueOperations: [...opIndex.values()],
  };
}

async function maybeCreateJiraIssue(draft) {
  const shouldCreate = process.env.WORKFLOW_CREATE_JIRA_ISSUE === "1";
  const shouldPreview = process.env.WORKFLOW_PREVIEW_JIRA_REQUEST === "1";

  if (!shouldCreate && !shouldPreview) {
    return {
      skipped: true,
      reason: "Set WORKFLOW_PREVIEW_JIRA_REQUEST=1 or WORKFLOW_CREATE_JIRA_ISSUE=1",
    };
  }

  const base =
    process.env.CLAWQL_API_BASE_URL?.replace(/\/$/, "") ||
    process.env.JIRA_SITE?.replace(/\/$/, "");
  const projectKey = process.env.WORKFLOW_JIRA_PROJECT_KEY?.trim();
  const accountId = process.env.WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID?.trim();
  const issueTypeName =
    process.env.WORKFLOW_JIRA_ISSUE_TYPE_NAME?.trim() || "Task";

  if (shouldCreate && (!base || !projectKey)) {
    return {
      skipped: false,
      ok: false,
      error:
        "Missing CLAWQL_API_BASE_URL (or JIRA_SITE) or WORKFLOW_JIRA_PROJECT_KEY",
    };
  }

  let headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
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
    priority: { name: draft.priorityName || "High" },
  };

  if (accountId) {
    fields.assignee = { accountId };
  }

  const body = { fields };

  const url = base
    ? `${base}/rest/api/3/issue`
    : "<missing-base-url>/rest/api/3/issue";
  const redactedHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      k.toLowerCase() === "authorization" ? "<redacted>" : v,
    ])
  );

  if (shouldPreview) {
    const missingConfig = [];
    if (!base) missingConfig.push("CLAWQL_API_BASE_URL (or JIRA_SITE)");
    if (!projectKey) missingConfig.push("WORKFLOW_JIRA_PROJECT_KEY");
    return {
      preview: true,
      skipped: true,
      reason: "Dry run; request not sent",
      missingConfig,
      request: {
        method: "POST",
        url,
        headers: redactedHeaders,
        body,
      },
    };
  }

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

  console.log("=== ClawQL complex release-stack workflow (merged all-providers preset) ===\n");
  console.log(
    `Preset: CLAWQL_PROVIDER=all-providers (${report.meta.logicalProviders.join(", ")})`
  );
  console.log(
    `Merged operations indexed across provider specs: ${report.meta.mergedOperationCount}`
  );
  console.log(
    `Per-provider: ${Object.entries(report.meta.providerOperationCounts)
      .map(([p, c]) => `${p}=${c}`)
      .join(", ")}`
  );
  console.log(
    `Unique candidate operations in report: ${report.meta.uniqueOperationsConsidered}`
  );
  console.log(`Draft due (+7 days): ${report.meta.dueDateOneWeek}`);
  console.log(`Assignee (display name in description): ${report.meta.assigneeDisplayName}\n`);

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

  const outPath = join(ROOT, "docs", "workflow-complex-release-stack-latest.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.error(`Wrote structured report: ${outPath}\n`);

  console.log("--- Jira draft (summary) ---");
  console.log(report.jiraDraft.summary);
  console.log("\n--- Jira draft (labels) ---");
  console.log(report.jiraDraft.labels.join(", "));
  console.log("\n--- Jira draft (description, excerpt) ---");
  console.log(report.jiraDraft.descriptionPlain.slice(0, 2400));
  if (report.jiraDraft.descriptionPlain.length > 2400) {
    console.log("\n... [truncated in console; full text in JSON report] ...\n");
  }

  const jiraResult = await maybeCreateJiraIssue(report.jiraDraft);
  console.log("\n--- Jira API ---");
  console.log(JSON.stringify(jiraResult, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        exit: "success",
        reportPath: outPath,
        mergedOperationCount: report.meta.mergedOperationCount,
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
