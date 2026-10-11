#!/usr/bin/env node
/**
 * Mechanical Schema / ParseResult renames for Effect v4.
 * Manual follow-ups still needed for optionalWith defaults and complex transforms.
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

function transform(src) {
  let s = src;
  let n = 0;
  const bump = (re, to) => {
    const before = s;
    if (typeof to === "function") {
      s = s.replace(re, (...args) => {
        n++;
        return to(...args);
      });
    } else {
      // Pass string replacement directly so $1/$2 work.
      s = s.replace(re, (...args) => {
        // Manual $n expansion from capture groups
        n++;
        return to.replace(/\$(\d+)/g, (_, i) => args[Number(i)] ?? "");
      });
    }
    return s !== before;
  };

  // Imports
  bump(
    /import\s*\{\s*([^}]*?)\bParseResult\b([^}]*)\}\s*from\s*["']effect["']/g,
    (m, a, b) => {
      const parts = `${a}${b}`
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x && x !== "ParseResult");
      if (!parts.includes("SchemaIssue")) parts.push("SchemaIssue");
      if (!parts.includes("Schema")) parts.unshift("Schema");
      // dedupe
      const uniq = [...new Set(parts)];
      return `import { ${uniq.join(", ")} } from "effect"`;
    }
  );

  // formatParseError helper body (common pattern)
  bump(
    /function formatParseError\(err: ParseResult\.ParseError\): Error \{\s*return new Error\(ParseResult\.TreeFormatter\.formatErrorSync\(err\)\);\s*\}/g,
    `function formatParseError(err: Schema.SchemaError): Error {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(err.issue);
  return new Error(JSON.stringify(formatted.issues));
}`
  );

  bump(/Schema\.decodeUnknown\b/g, "Schema.decodeUnknownEffect");
  bump(/Schema\.encodeUnknown\b/g, "Schema.encodeUnknownEffect");
  bump(/Schema\.decodeEither\b/g, "Schema.decodeExit");
  bump(/Schema\.decodeUnknownEither\b/g, "Schema.decodeUnknownExit");

  // optionalWith(schema, { default: () => X }) → schema.pipe(withDecodingDefaultType(Effect.succeed(X)))
  bump(
    /Schema\.optionalWith\(\s*([\s\S]*?)\s*,\s*\{\s*default:\s*\(\)\s*=>\s*([^}]+?)\s*,?\s*\}\s*\)/g,
    (_, inner, def) =>
      `(${inner}).pipe(Schema.withDecodingDefaultType(Effect.succeed(${def.trim()})))`
  );

  // annotations → annotate (method + Schema.annotations)
  bump(/\.annotations\(/g, ".annotate(");
  bump(/Schema\.annotations\(/g, "Schema.annotate(");

  // filters → check(is*)
  bump(/Schema\.nonEmptyString\(\)/g, "Schema.check(Schema.isNonEmpty())");
  bump(/Schema\.int\(\)/g, "Schema.check(Schema.isInt())");
  bump(
    /Schema\.between\(\s*([^,]+)\s*,\s*([^)]+)\)/g,
    "Schema.check(Schema.isBetween({ minimum: $1, maximum: $2 }))"
  );
  bump(/Schema\.maxLength\(([^)]+)\)/g, "Schema.check(Schema.isMaxLength($1))");
  bump(/Schema\.minLength\(([^)]+)\)/g, "Schema.check(Schema.isMinLength($1))");
  bump(
    /Schema\.greaterThanOrEqualTo\(([^)]+)\)/g,
    "Schema.check(Schema.isGreaterThanOrEqualTo($1))"
  );
  bump(/Schema\.greaterThan\(([^)]+)\)/g, "Schema.check(Schema.isGreaterThan($1))");
  bump(/Schema\.lessThanOrEqualTo\(([^)]+)\)/g, "Schema.check(Schema.isLessThanOrEqualTo($1))");
  bump(/Schema\.lessThan\(([^)]+)\)/g, "Schema.check(Schema.isLessThan($1))");

  // Record({ key, value }) → Record(key, value)
  bump(
    /Schema\.Record\(\s*\{\s*key:\s*([^,]+),\s*value:\s*([^}]+)\s*\}\s*\)/g,
    "Schema.Record($1, $2)"
  );

  // Schema.Literal("a", "b") with 2+ args → Literals([...])
  // Keep single-arg Literal as-is.
  bump(/Schema\.Literal\(([^)]*)\)/g, (full, args) => {
    // skip if already one arg without comma at top level
    let depth = 0;
    let commas = 0;
    for (let i = 0; i < args.length; i++) {
      const c = args[i];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === "," && depth === 0) commas++;
    }
    if (commas === 0) return full;
    n++; // already counted by bump once; adjust: bump always counts once per match
    return `Schema.Literals([${args}])`;
  });

  // Schema.Union(A, B, ...) → Schema.Union([A, B, ...]) when multiple members
  // Careful: nested parens. Only rewrite when the call has top-level commas.
  bump(/Schema\.Union\(/g, "Schema.Union("); // placeholder to enter custom
  // Custom Union rewrite
  {
    let out = "";
    let i = 0;
    while (i < s.length) {
      const idx = s.indexOf("Schema.Union(", i);
      if (idx === -1) {
        out += s.slice(i);
        break;
      }
      out += s.slice(i, idx);
      const startArgs = idx + "Schema.Union(".length;
      // if already Schema.Union([ — leave
      let j = startArgs;
      while (/\s/.test(s[j])) j++;
      if (s[j] === "[") {
        out += "Schema.Union(";
        i = startArgs;
        continue;
      }
      // find matching close paren
      let depth = 1;
      let k = startArgs;
      for (; k < s.length; k++) {
        if (s[k] === "(") depth++;
        else if (s[k] === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      const args = s.slice(startArgs, k);
      let d = 0;
      let commas = 0;
      for (let p = 0; p < args.length; p++) {
        const c = args[p];
        if (c === "(" || c === "[" || c === "{") d++;
        else if (c === ")" || c === "]" || c === "}") d--;
        else if (c === "," && d === 0) commas++;
      }
      if (commas > 0) {
        out += `Schema.Union([${args}])`;
        n++;
      } else {
        out += `Schema.Union(${args})`;
      }
      i = k + 1;
    }
    s = out;
  }

  return { out: s, changes: n };
}

let files = 0;
let total = 0;
for (const f of roots.flatMap((r) => walk(r))) {
  const src = readFileSync(f, "utf8");
  if (
    !src.includes("Schema.") &&
    !src.includes("ParseResult") &&
    !src.includes(".annotations(")
  )
    continue;
  const { out, changes } = transform(src);
  if (changes > 0 && out !== src) {
    writeFileSync(f, out);
    files++;
    total += changes;
    console.log(`${f.replace(root + "/", "")}: ~${changes}`);
  }
}
console.log(`\nUpdated ${files} files (~${total} schema renames).`);
