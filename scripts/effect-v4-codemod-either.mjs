#!/usr/bin/env node
/**
 * Effect.either → Effect.result; Either.* → Result.* (Effect v4).
 * Also rewrites common `_tag === "Left"|"Right"` checks after Effect.result.
 * Does NOT blindly rewrite `.left`/`.right` property access (too many false positives).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const roots = [join(root, "packages"), join(root, "src"), join(root, "apps")];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".next") continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

let files = 0;
for (const f of roots.flatMap((r) => walk(r))) {
  let s = readFileSync(f, "utf8");
  if (!s.includes("Effect.either") && !/\bEither\b/.test(s)) continue;
  const before = s;

  s = s.replace(/Effect\.either\b/g, "Effect.result");
  s = s.replace(/Either\.isLeft\b/g, "Result.isFailure");
  s = s.replace(/Either\.isRight\b/g, "Result.isSuccess");
  s = s.replace(/Either\.left\b/g, "Result.fail");
  s = s.replace(/Either\.right\b/g, "Result.succeed");
  s = s.replace(/Either\.match\b/g, "Result.match");

  s = s.replace(/import\s*\{([^}]+)\}\s*from\s*["']effect["']/g, (m, body) => {
    if (!/\bEither\b/.test(body)) return m;
    let parts = body
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((p) => (p === "Either" ? "Result" : p));
    parts = [...new Set(parts)];
    return `import { ${parts.join(", ")} } from "effect"`;
  });

  // Common Result tag checks (formerly Either)
  s = s.replace(/\._tag\s*===\s*["']Left["']/g, '._tag === "Failure"');
  s = s.replace(/\._tag\s*===\s*["']Right["']/g, '._tag === "Success"');
  s = s.replace(/\._tag\s*!==\s*["']Left["']/g, '._tag !== "Failure"');
  s = s.replace(/\._tag\s*!==\s*["']Right["']/g, '._tag !== "Success"');

  // Property access patterns after Result.isFailure / isSuccess narrowing in tests:
  // embeddingResult.right → embeddingResult.success (only when clearly Result from either/result)
  // Conservative: replace `.right` / `.left` only on identifiers that appear with Effect.result
  // or Result.isFailure/isSuccess in the same file — still risky. Prefer known patterns:
  s = s.replace(
    /(\w+)\.right\b/g,
    (full, id) => {
      // only if this id is used with Effect.result / Result.is* nearby in file
      const usedAsResult =
        new RegExp(`Effect\\.result\\([^)]*${id}|${id}[^;\\n]*Effect\\.result|Result\\.is(?:Failure|Success)\\(${id}\\)`).test(
          before
        ) ||
        new RegExp(`${id}\\s*=\\s*[^;\\n]*Effect\\.result`).test(before) ||
        new RegExp(`const\\s+${id}\\s*=`).test(before) && before.includes("Effect.result");
      // Broader but practical: if file uses Effect.result and Result.is*, rewrite .right/.left
      if (before.includes("Effect.either") || before.includes("Effect.result")) {
        if (
          before.includes(`Either.isLeft(${id})`) ||
          before.includes(`Either.isRight(${id})`) ||
          before.includes(`Result.isFailure(${id})`) ||
          before.includes(`Result.isSuccess(${id})`) ||
          before.includes(`${id}.pipe(Effect.either)`) ||
          before.includes(`${id}.pipe(Effect.result)`) ||
          before.includes(`yield* Effect.either`) ||
          before.includes(`yield* Effect.result`) ||
          before.includes(`Effect.either(`) ||
          before.includes(`Effect.result(`)
        ) {
          // Still too broad for ALL .right in file. Only rewrite if id looks result-like.
          if (
            /result|gated|verification|embedding|leases|outcome|attempt|decoded|parsed|either/i.test(
              id
            )
          ) {
            return `${id}.success`;
          }
        }
      }
      return full;
    }
  );
  s = s.replace(
    /(\w+)\.left\b/g,
    (full, id) => {
      if (
        /result|gated|verification|embedding|leases|outcome|attempt|decoded|parsed|either/i.test(id)
      ) {
        if (before.includes("Effect.either") || before.includes("Effect.result") || before.includes("Either.")) {
          return `${id}.failure`;
        }
      }
      return full;
    }
  );

  if (s !== before) {
    writeFileSync(f, s);
    files++;
    console.log(f.replace(root + "/", ""));
  }
}
console.log(`\nUpdated ${files} files.`);
