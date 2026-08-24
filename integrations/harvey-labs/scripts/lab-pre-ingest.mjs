#!/usr/bin/env node
/**
 * Harvey LAB vault pre-ingest CLI (Node ESM — no Python, no direct DuckDB import).
 *
 * Env:
 *   CLAWQL_OBSIDIAN_VAULT_PATH — task vault root
 *   CLAWQL_LAB_DOCUMENTS_DIR — DMS root (expects matters/ subdir)
 *   CLAWQL_LAB_TASK_ID — LAB task id
 *   CLAWQL_ENABLE_DATA — must be 1 on MCP server for data_ingest
 *   CLAWQL_MCP_URL, CLAWQL_MCP_PROTOCOL_VERSION — MCP HTTP endpoint
 *   CLAWQL_EXTERNAL_INGEST — default 1; bulk ingest_external_knowledge
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LabMcpClient, mcpToolText, unwrapMcpToolPayload } from "./lab-mcp-client.mjs";
import { INGEST_CACHE_NAME, seedFirmKnowledgeDms } from "./lab-vault-seed.mjs";

const BULK_INGEST_BATCH = 25;
const BULK_INGEST_HTTP_TIMEOUT_MS = 600_000;

/**
 * @param {import('./lab-mcp-client.mjs').LabMcpClient} mcpClient
 * @param {{ path: string; markdown: string }[]} documents
 */
async function flushBulkMarkdownDocs(mcpClient, documents) {
  if (!documents.length) return;
  const mcpDocs = documents.map(({ path, markdown }) => ({ path, markdown }));
  const useBulk = (process.env.CLAWQL_EXTERNAL_INGEST ?? "1").trim() === "1";
  if (useBulk) {
    try {
      for (let i = 0; i < mcpDocs.length; i += BULK_INGEST_BATCH) {
        const batch = mcpDocs.slice(i, i + BULK_INGEST_BATCH);
        console.log(
          `ClawQL pre-ingest: bulk ingest_external_knowledge ${i + 1}–${i + batch.length} / ${mcpDocs.length}`
        );
        const result = await mcpClient.callTool(
          "ingest_external_knowledge",
          { documents: batch, dryRun: false },
          { timeout: BULK_INGEST_HTTP_TIMEOUT_MS }
        );
        if (result && typeof result === "object" && result.isError) {
          throw new Error(JSON.stringify(result));
        }
        let body = result;
        if (result && typeof result === "object" && Array.isArray(result.content)) {
          for (const block of result.content) {
            if (block && typeof block === "object" && block.type === "text") {
              try {
                body = JSON.parse(block.text ?? "{}");
              } catch {
                body = { raw: block.text };
              }
              break;
            }
          }
        }
        if (body && typeof body === "object" && body.ok === false) {
          throw new Error(body.message || body.error || JSON.stringify(body));
        }
      }
      return;
    } catch (exc) {
      console.log(
        `ClawQL pre-ingest: bulk ingest failed (${exc}); falling back to per-matter memory_ingest`
      );
    }
  }
  for (const doc of mcpDocs) {
    const title =
      (typeof doc.title === "string" && doc.title.trim()) ||
      doc.path.split("/").pop()?.replace(/\.md$/i, "") ||
      doc.path;
    await mcpClient.callTool("memory_ingest", {
      title,
      type: "entity",
      insights: `LAB seed ${title}`,
      toolOutputs: doc.markdown,
      sessionId: `harvey-lab:${process.env.CLAWQL_LAB_TASK_ID ?? "unknown"}`,
      append: true,
    });
  }
}

/**
 * Re-upsert ontology pages with titles that include HSR_SECOND_REQUEST / CREDIT_FACILITY
 * so structured memory_recall filters on `title.contains` work (bulk path uses filename titles).
 *
 * @param {import('./lab-mcp-client.mjs').LabMcpClient} mcpClient
 * @param {{ path: string; markdown: string; matter_id?: string; title?: string }[]} docs
 * @param {string} flag
 * @param {number} expected
 * @param {string} taskId
 */
async function ensureOntologyFlagTitles(mcpClient, docs, flag, expected, taskId) {
  if (!docs.length) {
    console.log(`ClawQL pre-ingest: no ${flag} docs to ontology-verify`);
    return;
  }
  for (const doc of docs) {
    const title =
      (typeof doc.title === "string" && doc.title.trim()) ||
      doc.path.split("/").pop()?.replace(/\.md$/i, "") ||
      doc.path;
    await mcpClient.callTool(
      "memory_ingest",
      {
        title,
        type: "entity",
        insights: `LAB ontology upsert ${doc.matter_id ?? title} ${flag}`,
        toolOutputs: doc.markdown,
        sessionId: `harvey-lab:${taskId}`,
        append: false,
      },
      { timeout: BULK_INGEST_HTTP_TIMEOUT_MS }
    );
  }
  try {
    const raw = await mcpClient.callTool("memory_recall", {
      query: `${flag} cohort verify`,
      schema: "legal.Matter",
      filters: { title: { contains: flag } },
      limit: 50,
    });
    const enriched = unwrapMcpToolPayload(raw);
    const ids =
      enriched && typeof enriched === "object" && Array.isArray(enriched.matterIds)
        ? enriched.matterIds
        : [];
    console.log(
      `ClawQL pre-ingest: ontology ${flag} recall N=${ids.length} expected=${expected} ids=${JSON.stringify(ids)}`
    );
    if (expected && ids.length !== expected) {
      console.log(
        `ClawQL pre-ingest: WARNING ontology ${flag} cohort size mismatch — agent may report wrong frequency denominator`
      );
    }
  } catch (exc) {
    console.log(`ClawQL pre-ingest: ${flag} ontology verify failed (${exc})`);
  }
}

/**
 * @param {import('./lab-mcp-client.mjs').LabMcpClient} mcpClient
 * @param {{ path: string; markdown: string; matter_id?: string; title?: string }[]} creditDocs
 * @param {number} expected
 * @param {string} taskId
 */
async function ensureCreditFacilityOntology(mcpClient, creditDocs, expected, taskId) {
  return ensureOntologyFlagTitles(mcpClient, creditDocs, "CREDIT_FACILITY", expected, taskId);
}

/**
 * @param {import('./lab-mcp-client.mjs').LabMcpClient} mcpClient
 * @param {{ path: string; markdown: string; matter_id?: string; title?: string }[]} hsrDocs
 * @param {number} expected
 * @param {string} taskId
 */
async function ensureHsrSecondRequestOntology(mcpClient, hsrDocs, expected, taskId) {
  return ensureOntologyFlagTitles(mcpClient, hsrDocs, "HSR_SECOND_REQUEST", expected, taskId);
}

/**
 * @param {import('./lab-mcp-client.mjs').LabMcpClient} mcpClient
 * @param {string} mattersRoot
 * @param {number} expectedCredit
 */
async function buildLabDuckdbViaMcp(mcpClient, mattersRoot, expectedCredit) {
  if (process.env.CLAWQL_ENABLE_DATA !== "1") {
    console.log(
      "ClawQL pre-ingest: CLAWQL_ENABLE_DATA!=1 — skipping data_ingest (MCP server must enable Node DuckDB)"
    );
    return;
  }
  try {
    const result = await mcpClient.callTool(
      "data_ingest",
      { replace: true, mattersRoot: resolve(mattersRoot) },
      { timeout: BULK_INGEST_HTTP_TIMEOUT_MS }
    );
    const body = mcpToolText(result);
    let parsed = {};
    try {
      parsed = body.trim().startsWith("{") ? JSON.parse(body) : { raw: body };
    } catch {
      parsed = { raw: body };
    }
    if (parsed.ok === false) {
      throw new Error(parsed.error || body);
    }
    console.log(
      `ClawQL pre-ingest: Node DuckDB ${parsed.path ?? "data_ingest"} ` +
        `matters=${parsed.matterCount} documents=${parsed.documentCount} open_facts=${parsed.openFactCount} ` +
        `(ontology CREDIT_FACILITY expected ${expectedCredit})`
    );
    try {
      const hq = await mcpClient.callTool(
        "data_query",
        {
          sql: "SELECT COUNT(*) AS n FROM matters WHERE is_hsr_second_request",
        },
        { timeout: 60_000 }
      );
      const hbody = mcpToolText(hq);
      const hparsed = hbody.trim().startsWith("{") ? JSON.parse(hbody) : {};
      const n = hparsed?.rows?.[0]?.n ?? hparsed?.rows?.[0]?.N;
      console.log(`ClawQL pre-ingest: DuckDB is_hsr_second_request count=${n}`);
    } catch (exc) {
      console.log(`ClawQL pre-ingest: HSR count probe failed (${exc})`);
    }
  } catch (exc) {
    throw new Error(
      `ClawQL data_ingest failed. Enable CLAWQL_ENABLE_DATA=1 on the MCP server (Node DuckDB). ${exc}`
    );
  }
}

async function main() {
  const vaultPath = process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim();
  const documentsDir = process.env.CLAWQL_LAB_DOCUMENTS_DIR?.trim();
  const taskId = process.env.CLAWQL_LAB_TASK_ID?.trim();

  if (!vaultPath) {
    console.error("CLAWQL_OBSIDIAN_VAULT_PATH is required");
    process.exit(1);
  }
  if (!documentsDir) {
    console.error("CLAWQL_LAB_DOCUMENTS_DIR is required");
    process.exit(1);
  }
  if (!taskId) {
    console.error("CLAWQL_LAB_TASK_ID is required");
    process.exit(1);
  }

  const cacheMarker = join(vaultPath, INGEST_CACHE_NAME);
  try {
    const { access } = await import("node:fs/promises");
    await access(cacheMarker);
    console.log(`ClawQL pre-ingest: cache marker exists (${cacheMarker}), skipping`);
    return;
  } catch {
    // continue
  }

  await mkdir(join(vaultPath, "Memory"), { recursive: true });

  const mattersRoot = join(resolve(documentsDir), "matters");
  try {
    const { stat } = await import("node:fs/promises");
    const st = await stat(mattersRoot);
    if (!st.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`matters/ subdir not found under ${documentsDir}`);
    process.exit(1);
  }

  const mcpClient = new LabMcpClient();
  await mcpClient.ensureSession();

  const { hsrCount, creditCount, hsrDocs, creditDocs, bulkDocs } = await seedFirmKnowledgeDms({
    mattersRoot,
    taskId,
    mcpClient,
    env: process.env,
  });

  await flushBulkMarkdownDocs(mcpClient, bulkDocs);
  await ensureHsrSecondRequestOntology(mcpClient, hsrDocs, hsrCount, taskId);
  await ensureCreditFacilityOntology(mcpClient, creditDocs, creditCount, taskId);
  await buildLabDuckdbViaMcp(mcpClient, mattersRoot, creditCount);

  await writeFile(
    cacheMarker,
    JSON.stringify(
      {
        task_id: taskId,
        documents_dir: documentsDir,
        ingested_at: Date.now() / 1000,
        hsr_count: hsrCount,
        credit_count: creditCount,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `ClawQL pre-ingest: complete (HSR=${hsrCount}, CREDIT_FACILITY=${creditCount}, docs=${bulkDocs.length})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
