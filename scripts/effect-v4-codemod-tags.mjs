#!/usr/bin/env node
/**
 * Mechanical Context.Tag / Context.GenericTag → Context.Service (Effect v4).
 * See https://github.com/Effect-TS/effect/blob/main/migration/services.md
 *
 * Angle-bracket matching must ignore `=>` (common in service method types).
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
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx") || ent.name.endsWith(".mts"))
      acc.push(p);
  }
  return acc;
}

/** Balance `<`/`>` starting at `start` (index of first `<`), ignoring `=>`. */
function findMatchingAngle(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "<") {
      depth++;
      continue;
    }
    if (c === ">" && src[i - 1] === "=") {
      // arrow `=>` — not a type closer
      continue;
    }
    if (c === ">") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelComma(typeParams) {
  let depthAngle = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  for (let k = 0; k < typeParams.length; k++) {
    const ch = typeParams[k];
    const prev = k > 0 ? typeParams[k - 1] : "";
    if (ch === "<") depthAngle++;
    else if (ch === ">" && prev !== "=") depthAngle--;
    else if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    else if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    else if (ch === "[") depthBracket++;
    else if (ch === "]") depthBracket--;
    else if (
      ch === "," &&
      depthAngle === 0 &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      return k;
    }
  }
  return -1;
}

function transform(src) {
  let out = "";
  let i = 0;
  let changes = 0;

  while (i < src.length) {
    const tagIdx = src.indexOf("Context.Tag(", i);
    const genericIdx = src.indexOf("Context.GenericTag<", i);
    const next =
      tagIdx === -1
        ? genericIdx
        : genericIdx === -1
          ? tagIdx
          : Math.min(tagIdx, genericIdx);

    if (next === -1) {
      out += src.slice(i);
      break;
    }

    out += src.slice(i, next);

    if (next === genericIdx) {
      const angleStart = next + "Context.GenericTag".length;
      const angleEnd = findMatchingAngle(src, angleStart);
      if (angleEnd === -1) {
        out += src.slice(next, next + 20);
        i = next + 20;
        continue;
      }
      const typeParams = src.slice(angleStart + 1, angleEnd).trim();
      const comma = splitTopLevelComma(typeParams);
      const shape =
        comma === -1 ? typeParams : typeParams.slice(comma + 1).trim();
      let j = angleEnd + 1;
      while (/\s/.test(src[j])) j++;
      if (src[j] !== "(") {
        out += src.slice(next, angleEnd + 1);
        i = angleEnd + 1;
        continue;
      }
      const idClose = src.indexOf(")", j);
      const idCall = src.slice(j, idClose + 1);
      out += `Context.Service<${shape}>${idCall}`;
      i = idClose + 1;
      changes++;
      continue;
    }

    const openParen = next + "Context.Tag".length;
    const closeParen = src.indexOf(")", openParen);
    if (closeParen === -1) {
      out += src.slice(next, openParen + 1);
      i = openParen + 1;
      continue;
    }
    const idExpr = src.slice(openParen + 1, closeParen).trim();
    let j = closeParen + 1;
    while (/\s/.test(src[j])) j++;
    if (src[j] !== "<") {
      out += src.slice(next, j);
      i = j;
      continue;
    }
    const angleEnd = findMatchingAngle(src, j);
    if (angleEnd === -1) {
      out += src.slice(next, j + 1);
      i = j + 1;
      continue;
    }
    const typeParams = src.slice(j + 1, angleEnd);
    const comma = splitTopLevelComma(typeParams);
    if (comma === -1) {
      out += src.slice(next, angleEnd + 1);
      i = angleEnd + 1;
      continue;
    }
    const self = typeParams.slice(0, comma).trim();
    const shape = typeParams.slice(comma + 1).trim();
    let k = angleEnd + 1;
    while (/\s/.test(src[k])) k++;
    if (src[k] !== "(" || src[k + 1] !== ")") {
      out += src.slice(next, angleEnd + 1);
      i = angleEnd + 1;
      continue;
    }
    k += 2;
    out += `Context.Service<${self}, ${shape}>()(${idExpr})`;
    i = k;
    changes++;
  }

  return { out, changes };
}

const files = roots.flatMap((r) => walk(r));
let totalFiles = 0;
let totalChanges = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!src.includes("Context.Tag(") && !src.includes("Context.GenericTag<")) continue;
  const { out, changes } = transform(src);
  if (changes > 0 && out !== src) {
    writeFileSync(f, out);
    totalFiles++;
    totalChanges += changes;
    console.log(`${f.replace(root + "/", "")}: ${changes}`);
  }
}
console.log(`\nUpdated ${totalFiles} files (${totalChanges} Tag→Service replacements).`);
