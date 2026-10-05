/**
 * Holds `@ts-expect-error` mistake files honest (from gdp-ts check-mistakes).
 *
 * 1. Type-check a copy of the file with directives disabled.
 * 2. Every directive's next line must have exactly one error; no other lines may.
 * 3. Errors keyed by directive comment must match a recorded snapshot.
 *
 * Run with UPDATE_SNAPSHOTS=1 to re-record after a deliberate change.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTIVE = /^\s*\/\/ @ts-expect-error\b\s*(.*)$/;

interface Diagnostic {
  line: number;
  code: string;
  message: string;
}

export type CheckMistakesOptions = {
  /** Package root (directory with tsconfig.json + node_modules/.bin/tsc or repo root tsc). */
  readonly project: string;
  /** Absolute path to the mistakes.ts file. */
  readonly file: string;
  /** Absolute path to the snapshot file. */
  readonly snapshot: string;
  /** Optional path to tsc binary; defaults to project or repo root node_modules. */
  readonly tscBin?: string;
  /** tsconfig filename relative to project. Default tsconfig.json */
  readonly tsconfig?: string;
};

export function checkMistakes(options: CheckMistakesOptions): void {
  const { project, file, snapshot } = options;
  const source = readFileSync(file, "utf8");

  const expected = new Map<number, string>();
  source.split("\n").forEach((text, i) => {
    const match = DIRECTIVE.exec(text);
    if (match) expected.set(i + 2, match[1] ?? "");
  });
  assert.ok(expected.size > 0, `${file} has no @ts-expect-error directives`);

  const errors = typecheckUnsuppressed(project, file, source, options.tscBin, options.tsconfig ?? "tsconfig.json");

  const unexpected = errors.filter((e) => !expected.has(e.line));
  assert.deepEqual(unexpected, [], "errors on lines that are not marked as mistakes");
  for (const [line, reason] of expected) {
    const count = errors.filter((e) => e.line === line).length;
    assert.equal(count, 1, `line ${line} (${reason}): expected exactly one error, got ${count}`);
  }

  const actual =
    [...expected]
      .map(([line, reason]) => {
        const error = errors.find((e) => e.line === line);
        return `${reason}\n  ${error?.code} ${error?.message}`;
      })
      .join("\n\n") + "\n";

  if (process.env.UPDATE_SNAPSHOTS || !existsSync(snapshot)) writeFileSync(snapshot, actual);
  assert.equal(actual, readFileSync(snapshot, "utf8"), `errors differ from ${path.basename(snapshot)}`);
}

function resolveTsc(project: string, tscBin?: string): string {
  if (tscBin && existsSync(tscBin)) return tscBin;
  const candidates = [
    path.join(project, "node_modules/.bin/tsc"),
    path.join(project, "../../node_modules/.bin/tsc"),
    path.join(project, "../../../node_modules/.bin/tsc"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "tsc";
}

function typecheckUnsuppressed(
  project: string,
  file: string,
  source: string,
  tscBin?: string,
  tsconfig: string = "tsconfig.json"
): Diagnostic[] {
  const copy = file.replace(/\.ts$/, ".unsuppressed.tmp.ts");
  writeFileSync(copy, source.replace(/\/\/ @ts-expect-error\b/g, "// (disabled) ts-expect-error"));
  let output: string;
  try {
    output = execFileSync(resolveTsc(project, tscBin), ["-p", tsconfig, "--pretty", "false"], {
      cwd: project,
      encoding: "utf8",
    });
  } catch (error) {
    output = String((error as { stdout?: unknown }).stdout ?? "");
  } finally {
    rmSync(copy, { force: true });
  }

  const diagnostics: Diagnostic[] = [];
  const copyResolved = path.resolve(copy);
  for (const text of output.split("\n")) {
    const match = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(text);
    if (!match) continue;
    const filePath = match[1] ?? "";
    if (path.resolve(project, filePath) !== copyResolved && path.resolve(filePath) !== copyResolved) {
      continue;
    }
    diagnostics.push({
      line: Number(match[2]),
      code: match[3] ?? "",
      message: normalize(match[4] ?? ""),
    });
  }
  return diagnostics;
}

function normalize(message: string): string {
  return message.replace(/import\("[^"]*"(?:, \{[^)]*\})?\)\./g, "");
}

/** Absolute path helper for tests next to this file. */
export function hereFromMeta(metaUrl: string, relative: string): string {
  return fileURLToPath(new URL(relative, metaUrl));
}
