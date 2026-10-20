#!/usr/bin/env node
/**
 * Live-matrix ingest CLI for Cursor Task / model sessions.
 *
 * Arms:
 *   clawql      — real product gate (taint from channel, then memory_ingest)
 *   passthrough — direct vault write (no gateway)
 *
 * Usage (cwd = trial workdir):
 *   node live-ingest-cli.mjs --arm clawql|passthrough --workdir . \
 *     memory_ingest --title "..." --insights "..." [--append true|false] [--channel email]
 *
 * Writes result JSON to stdout and <workdir>/agent-result.json.
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeProductInvoke, resetSessionLabels } from "./product-gate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage(code = 1) {
  process.stderr.write(
    `Usage: node live-ingest-cli.mjs --arm clawql|passthrough --workdir <dir> memory_ingest --title <t> [--insights <s>] [--append true|false] [--channel email|ticket|doc|webhook]\n`
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    arm: null,
    workdir: ".",
    cmd: null,
    title: null,
    insights: "",
    append: true,
    channel: "email",
  };
  const a = [...argv];
  while (a.length) {
    const t = a.shift();
    if (t === "--arm") out.arm = a.shift();
    else if (t === "--workdir") out.workdir = a.shift() || ".";
    else if (t === "--title") out.title = a.shift();
    else if (t === "--insights") out.insights = a.shift() || "";
    else if (t === "--append") {
      const v = (a.shift() || "true").toLowerCase();
      out.append = v !== "false" && v !== "0";
    } else if (t === "--channel") out.channel = a.shift() || "email";
    else if (t === "--help" || t === "-h") usage(0);
    else if (!out.cmd && !t.startsWith("-")) out.cmd = t;
    else usage(1);
  }
  return out;
}

function slug(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function emit(workdir, obj) {
  writeFileSync(
    join(workdir, "agent-result.json"),
    `${JSON.stringify(obj, null, 2)}\n`,
    "utf8"
  );
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function productEnv(workdir) {
  return {
    ...process.env,
    CLAWQL_OBSIDIAN_VAULT_PATH: join(workdir, "vault"),
  };
}

async function runClawql(args, workdir) {
  await resetSessionLabels();
  const sessionId = `mai-live-${Date.now()}`;
  const ctx = await makeProductInvoke(sessionId, productEnv(workdir));
  ctx.taint(args.channel);
  const r = await ctx.invoke("memory_ingest", {
    title: args.title,
    insights: args.insights,
    append: args.append,
  });
  if (r.blocked) {
    return {
      ok: false,
      arm: "clawql",
      blocked: true,
      status: r.status || "blocked",
      mechanism: r.mechanism || null,
      detail: r.detail || "blocked",
      wrote_vault: false,
    };
  }
  // Gate allowed — apply labeled/unlabeled write like smoke product path.
  const labeled = Boolean(
    r.args?.tags?.includes?.("clawql-untrusted") ||
      (typeof r.args?.insights === "string" &&
        String(r.args.insights).includes("clawql-untrusted"))
  );
  const insights = String(r.args?.insights ?? args.insights);
  const title = String(r.args?.title ?? args.title);
  const body = labeled
    ? [
        "---",
        `title: ${title}`,
        "tags: [clawql-ingest, clawql-untrusted]",
        "---",
        "",
        `# ${title}`,
        "",
        "**clawql_trust:** untrusted",
        "",
        insights,
        "",
      ].join("\n")
    : `# ${title}\n\n${insights}\n`;
  const mem = join(workdir, "vault", "Memory");
  mkdirSync(mem, { recursive: true });
  const path = join(mem, `${slug(title) || "note"}.md`);
  writeFileSync(path, body, "utf8");
  return {
    ok: true,
    arm: "clawql",
    blocked: false,
    labeled,
    wrote_vault: true,
    path,
    detail: labeled ? "allowed_labeled" : "allowed_trusted",
  };
}

function runPassthrough(args, workdir) {
  const mem = join(workdir, "vault", "Memory");
  mkdirSync(mem, { recursive: true });
  const path = join(mem, `${slug(args.title) || "note"}.md`);
  const body = `# ${args.title}\n\n${args.insights}\n`;
  writeFileSync(path, body, "utf8");
  return {
    ok: true,
    arm: "passthrough",
    blocked: false,
    labeled: false,
    wrote_vault: true,
    path,
    detail: "passthrough_write",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.arm !== "clawql" && args.arm !== "passthrough") usage(1);
  if (args.cmd !== "memory_ingest") usage(1);
  if (!args.title?.trim()) usage(1);

  const workdir = resolve(args.workdir);
  mkdirSync(workdir, { recursive: true });
  if (!existsSync(join(workdir, "vault", "Memory"))) {
    emit(workdir, {
      ok: false,
      error: "missing_vault",
      detail: "trial workdir must contain vault/Memory (run prepare-live-trials)",
    });
    process.exit(2);
  }

  try {
    const result =
      args.arm === "clawql"
        ? await runClawql(args, workdir)
        : runPassthrough(args, workdir);
    emit(workdir, result);
    process.exit(result.blocked ? 3 : 0);
  } catch (e) {
    emit(workdir, {
      ok: false,
      error: "exception",
      detail: String(e?.message || e).slice(0, 500),
    });
    process.exit(1);
  }
}

main();
