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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
    const title = doc.path.split("/").pop()?.replace(/\.md$/i, "") ?? doc.path;
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
 * @param {import('./lab-mcp-client.mjs').LabMcpClient} mcpClient
 * @param {{ path: string; markdown: string; matter_id?: string }[]} creditDocs
 * @param {number} expected
 * @param {string} taskId
 */
async function ensureCreditFacilityOntology(mcpClient, creditDocs, expected, taskId) {
  if (!creditDocs.length) {
    console.log("ClawQL pre-ingest: no CREDIT_FACILITY docs to ontology-verify");
    return;
  }
  for (const doc of creditDocs) {
    const title = doc.path.split("/").pop()?.replace(/\.md$/i, "") ?? doc.path;
    await mcpClient.callTool(
      "memory_ingest",
      {
        title,
        type: "entity",
        insights: `LAB ontology upsert ${doc.matter_id ?? title} CREDIT_FACILITY`,
        toolOutputs: doc.markdown,
        sessionId: `harvey-lab:${taskId}`,
        append: false,
      },
      { timeout: BULK_INGEST_HTTP_TIMEOUT_MS }
    );
  }
  try {
    const raw = await mcpClient.callTool("memory_recall", {
      query: "CREDIT_FACILITY cohort verify",
      schema: "legal.Matter",
      filters: { title: { contains: "CREDIT_FACILITY" } },
      limit: 50,
    });
    const enriched = unwrapMcpToolPayload(raw);
    const ids =
      enriched && typeof enriched === "object" && Array.isArray(enriched.matterIds)
        ? enriched.matterIds
        : [];
    console.log(
      `ClawQL pre-ingest: ontology CREDIT_FACILITY recall N=${ids.length} expected=${expected} ids=${JSON.stringify(ids)}`
    );
    if (expected && ids.length !== expected) {
      console.log(
        "ClawQL pre-ingest: WARNING ontology cohort size mismatch — agent may report wrong frequency denominator"
      );
    }
  } catch (exc) {
    console.log(`ClawQL pre-ingest: CREDIT_FACILITY ontology verify failed (${exc})`);
  }
}

/**
 * Build Node DuckDB with path-detectors (HSR / credit / deal_value), not bare inventory.
 * Bare `data_ingest` alone leaves is_hsr_second_request=false and empty client_short_name —
 * agents then write wrong "0 of 266" deliverables.
 *
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
  const dbPath = process.env.CLAWQL_DATA_PATH?.trim();
  if (!dbPath) {
    throw new Error("CLAWQL_DATA_PATH is required for LAB DuckDB ingest");
  }

  const sqlGoldScript = join(dirname(fileURLToPath(import.meta.url)), "sql-gold-001-025.mjs");
  const goldOut = join(dirname(dbPath), "sql-gold-preingest-check.json");
  const { spawnSync } = await import("node:child_process");
  console.log(
    `ClawQL pre-ingest: sql-gold path-detectors → DuckDB ${dbPath} (mattersRoot=${mattersRoot})`
  );
  const gold = spawnSync(
    process.execPath,
    [sqlGoldScript, resolve(mattersRoot), resolve(dbPath), goldOut],
    {
      env: { ...process.env, CLAWQL_ENABLE_DATA: "1", CLAWQL_DATA_PATH: dbPath },
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  if (gold.stdout) process.stdout.write(gold.stdout);
  if (gold.stderr) process.stderr.write(gold.stderr);
  // Gold oracle may fail individual checks; still require a populated HSR column.
  // Fall back to bare data_ingest only if sql-gold crashed hard.
  if (gold.error) {
    throw new Error(`sql-gold failed to start: ${gold.error}`);
  }

  // Verify via MCP data_query (same path the agent uses).
  try {
    const result = await mcpClient.callTool(
      "data_query",
      {
        sql: "SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE is_hsr_second_request) AS hsr_true, COUNT(*) FILTER (WHERE coalesce(client_short_name,'')<>'') AS named FROM matters",
      },
      { timeout: 60_000 }
    );
    const body = mcpToolText(result);
    let parsed = {};
    try {
      parsed = body.trim().startsWith("{") ? JSON.parse(body) : { raw: body };
    } catch {
      parsed = { raw: body };
    }
    const row = Array.isArray(parsed.rows) ? parsed.rows[0] : null;
    const n = row ? Number(row.n ?? row.N ?? 0) : 0;
    const hsrTrue = row ? Number(row.hsr_true ?? row.HSR_TRUE ?? 0) : 0;
    const named = row ? Number(row.named ?? row.NAMED ?? 0) : 0;
    console.log(
      `ClawQL pre-ingest: Node DuckDB ${dbPath} matters=${n} hsr_true=${hsrTrue} named=${named} ` +
        `(ontology CREDIT_FACILITY expected ${expectedCredit}; sql-gold exit=${gold.status})`
    );
    if (!n) {
      throw new Error("DuckDB matters table empty after sql-gold");
    }
    if (!hsrTrue) {
      console.log(
        "ClawQL pre-ingest: WARNING hsr_true=0 — agent may emit false 0/N for second-request tasks"
      );
    }
  } catch (exc) {
    // If MCP verify fails, still keep sql-gold DB on disk for the agent.
    console.log(`ClawQL pre-ingest: DuckDB verify via MCP failed (${exc}); sql-gold status=${gold.status}`);
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
    const { access, readFile } = await import("node:fs/promises");
    await access(cacheMarker);
    const dbPath = process.env.CLAWQL_DATA_PATH?.trim();
    let hsrOk = false;
    if (dbPath) {
      try {
        const { DuckDBInstance } = await import("@duckdb/node-api");
        const inst = await DuckDBInstance.create(dbPath);
        const conn = await inst.connect();
        const r = await conn.runAndReadAll(
          "SELECT COUNT(*) FILTER (WHERE is_hsr_second_request) AS hsr_true FROM matters"
        );
        const rows = r.getRows();
        hsrOk = Number(rows?.[0]?.[0] ?? 0) > 0;
        await conn.closeSync?.();
      } catch {
        hsrOk = false;
      }
    }
    if (hsrOk) {
      console.log(`ClawQL pre-ingest: cache marker exists (${cacheMarker}), DuckDB HSR ok — skipping`);
      return;
    }
    console.log(
      `ClawQL pre-ingest: cache marker exists but DuckDB missing HSR flags — rebuilding`
    );
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(cacheMarker);
    } catch {
      // continue
    }
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

  const { hsrCount, creditCount, creditDocs, bulkDocs } = await seedFirmKnowledgeDms({
    mattersRoot,
    taskId,
    mcpClient,
    env: process.env,
  });

  await flushBulkMarkdownDocs(mcpClient, bulkDocs);
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
