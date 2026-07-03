import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  parseClawqlInstanceSpec,
  type ClawQLInstanceSpecV1Alpha1,
} from "./clawql-instance-v1alpha1.js";

function parseInstanceSpecDocument(raw: unknown): ClawQLInstanceSpecV1Alpha1 {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "spec" in raw) {
    return parseClawqlInstanceSpec((raw as { spec: unknown }).spec);
  }
  return parseClawqlInstanceSpec(raw);
}

function parseInstanceSpecText(text: string): ClawQLInstanceSpecV1Alpha1 {
  const trimmed = text.trim();
  const parsed = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(trimmed);
  return parseInstanceSpecDocument(parsed);
}

/** Load optional ClawQLInstance spec from env (`CLAWQL_INSTANCE_SPEC` JSON or `CLAWQL_INSTANCE_SPEC_FILE`). */
export async function loadClawqlInstanceSpecFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Promise<ClawQLInstanceSpecV1Alpha1 | undefined> {
  const inline = env.CLAWQL_INSTANCE_SPEC?.trim();
  if (inline) {
    return parseInstanceSpecDocument(JSON.parse(inline) as unknown);
  }
  const filePath = env.CLAWQL_INSTANCE_SPEC_FILE?.trim();
  if (!filePath) return undefined;
  const text = await readFile(filePath, "utf8");
  return parseInstanceSpecText(text);
}

/** Sync loader for MCP composition root (inline JSON or mounted spec file). */
export function loadClawqlInstanceSpecFromEnvSync(
  env: NodeJS.ProcessEnv = process.env
): ClawQLInstanceSpecV1Alpha1 | undefined {
  const inline = env.CLAWQL_INSTANCE_SPEC?.trim();
  if (inline) {
    return parseInstanceSpecDocument(JSON.parse(inline) as unknown);
  }
  const filePath = env.CLAWQL_INSTANCE_SPEC_FILE?.trim();
  if (!filePath) return undefined;
  const text = readFileSync(filePath, "utf8");
  return parseInstanceSpecText(text);
}
