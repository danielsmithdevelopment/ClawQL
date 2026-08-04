import { gatewayRedactionEnabled, maybeGatewayRedactText } from "clawql-api";
import type { PiiScrubMode } from "./types.js";

export async function scrubExportLine(line: string, mode: PiiScrubMode): Promise<string> {
  if (mode === "off") return line;
  if (!gatewayRedactionEnabled()) return line;
  try {
    const parsed = JSON.parse(line) as unknown;
    const scrubbed = await scrubJsonValue(parsed);
    return JSON.stringify(scrubbed);
  } catch {
    return maybeGatewayRedactText(line);
  }
}

async function scrubJsonValue(value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    return maybeGatewayRedactText(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => scrubJsonValue(v)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await scrubJsonValue(v);
    }
    return out;
  }
  return value;
}

export function resolvePiiScrubMode(noPiiScrub?: boolean): PiiScrubMode {
  return noPiiScrub ? "off" : "presidio";
}
