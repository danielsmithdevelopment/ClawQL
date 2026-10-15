#!/usr/bin/env node
/**
 * First-hit cost of DuckDB-style lazy horizontal plugins + failed-import clarity.
 *
 *   node scripts/benchmarks/lazy-plugin-first-hit.mjs
 *
 * Kubernetes is resolved from clawql-automation’s dependency tree (not the
 * scripts/ package root). Operator/k8s first use = dynamic import of
 * `@kubernetes/client-node` the same way `k8s-client.ts` does.
 */
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const require = createRequire(import.meta.url);
const OUT =
  process.env.OUT ||
  join(ROOT, "docs/benchmarks/gateway-multi-comparison/lazy-plugin-first-hit.json");

const PACKAGES = [
  { id: "clawql-memory/plugin", label: "memory", heavy: ["@xenova", "onnx"] },
  { id: "clawql-documents/plugin", label: "documents", heavy: [] },
  { id: "clawql-automation/plugin", label: "automation", heavy: ["@kubernetes"] },
  { id: "clawql-data/plugin", label: "data/duckdb", heavy: ["@duckdb"] },
  { id: "clawql-sandbox/plugin", label: "sandbox", heavy: [] },
  { id: "clawql-observability/plugin", label: "observability", heavy: [] },
  { id: "clawql-payments/plugin", label: "payments/stripe", heavy: ["stripe"] },
];

function timedRequire(id) {
  const t0 = performance.now();
  try {
    const mod = require(id);
    return { ok: true, ms: Number((performance.now() - t0).toFixed(2)), keys: Object.keys(mod).slice(0, 12) };
  } catch (err) {
    return {
      ok: false,
      ms: Number((performance.now() - t0).toFixed(2)),
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      code: err && typeof err === "object" && "code" in err ? err.code : null,
    };
  }
}

/**
 * Resolve + import @kubernetes/client-node the way automation does
 * (package is a dep of clawql-automation, not of the scripts tree).
 */
async function timedDynamicK8sFromAutomation() {
  const candidates = [
    join(ROOT, "packages/clawql-automation/dist/workflow/k8s-client.js"),
    join(ROOT, "packages/clawql-automation/src/workflow/k8s-client.ts"),
    join(ROOT, "node_modules/clawql-automation/package.json"),
  ];
  let requireFrom = null;
  for (const c of candidates) {
    if (existsSync(c)) {
      requireFrom = c;
      break;
    }
  }
  if (!requireFrom) {
    return {
      ok: false,
      ms: 0,
      error: "clawql-automation package path not found for k8s resolve",
    };
  }
  const autoReq = createRequire(requireFrom);
  let resolved;
  try {
    resolved = autoReq.resolve("@kubernetes/client-node");
  } catch (err) {
    return {
      ok: false,
      ms: 0,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      resolve_from: requireFrom,
    };
  }
  const t0 = performance.now();
  try {
    const k8s = await import(resolved);
    const keys = Object.keys(k8s);
    const hasAdmission = keys.some((k) => /Admission/i.test(k));
    return {
      ok: true,
      ms: Number((performance.now() - t0).toFixed(2)),
      resolve_from: requireFrom,
      resolved,
      exports_sample: keys.filter((k) => /Api$/.test(k)).slice(0, 8),
      admission_surface: hasAdmission,
      export_count: keys.length,
    };
  } catch (err) {
    return {
      ok: false,
      ms: Number((performance.now() - t0).toFixed(2)),
      resolve_from: requireFrom,
      resolved,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

async function failedImportClarity() {
  const cases = [];

  // Missing package entirely (what happens if a horizontal dep is absent).
  {
    const bogus = "clawql-plugin-definitely-missing-" + Date.now();
    const t0 = performance.now();
    try {
      require(bogus);
      cases.push({ case: "missing_package", ok: false, note: "expected throw" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === "object" && "code" in err ? err.code : null;
      cases.push({
        case: "missing_package",
        ok: true,
        ms: Number((performance.now() - t0).toFixed(2)),
        code,
        message: msg.slice(0, 280),
        clear_module_not_found: code === "MODULE_NOT_FOUND" || /Cannot find module|Cannot find package/.test(msg),
      });
    }
  }

  // Bad export subpath on a real package (misconfigured plugin id).
  {
    const bogus = "clawql-automation/plugin-does-not-exist-" + Date.now();
    const t0 = performance.now();
    try {
      require(bogus);
      cases.push({ case: "bad_export_subpath", ok: false, note: "expected throw" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === "object" && "code" in err ? err.code : null;
      cases.push({
        case: "bad_export_subpath",
        ok: true,
        ms: Number((performance.now() - t0).toFixed(2)),
        code,
        message: msg.slice(0, 280),
        clear_exports_error:
          code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || /Package subpath|is not defined by "exports"/.test(msg),
      });
    }
  }

  // Sync composer: enabling a flag whose package path is wrong must throw, not
  // return a half-built Layer list. We simulate by requiring a missing plugin id
  // the same way compose-horizontal does (createRequire + require).
  {
    const t0 = performance.now();
    try {
      require("clawql-memory/plugin-typo-missing");
      cases.push({ case: "composer_style_bad_plugin", ok: false, note: "expected throw" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === "object" && "code" in err ? err.code : null;
      cases.push({
        case: "composer_style_bad_plugin",
        ok: true,
        ms: Number((performance.now() - t0).toFixed(2)),
        code,
        message: msg.slice(0, 280),
        fails_closed: true,
        note: "compose-horizontal has no try/catch around require — flag-on + missing plugin aborts listen",
      });
    }
  }

  return {
    all_clear: cases.every((c) => c.ok && (c.clear_module_not_found || c.clear_exports_error || c.fails_closed)),
    cases,
  };
}

async function main() {
  const hits = [];
  for (const p of PACKAGES) {
    hits.push({ ...p, first_require: timedRequire(p.id) });
  }
  // Second require of automation should be cached (already loaded above).
  const automationSecond = timedRequire("clawql-automation/plugin");

  const k8s = await timedDynamicK8sFromAutomation();
  const k8s2 = await timedDynamicK8sFromAutomation();
  const failed = await failedImportClarity();

  const report = {
    measuredAt: new Date().toISOString(),
    note:
      "Cold require() of each plugin package in this Node process (order as listed). " +
      "Operator/k8s first use is the dynamic import of @kubernetes/client-node resolved from clawql-automation.",
    plugin_first_hits: hits,
    automation_second_require_ms: automationSecond.ok ? automationSecond.ms : null,
    kubernetes_dynamic_import: { first: k8s, second_cached: k8s2 },
    failed_import: failed,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  // Also mirror to artifacts for walkthrough.
  try {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync("/opt/cursor/artifacts/lazy-plugin-first-hit.json", JSON.stringify(report, null, 2));
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
