#!/usr/bin/env node
/**
 * Download Linear's public GraphQL SDL from their MIT-licensed SDK repo into `providers/linear/schema.graphql`.
 * Same source as `BUNDLED_PROVIDERS.linear.fallbackUrl` in `src/provider-registry.ts`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outPath = resolve(root, "providers/linear/schema.graphql");
const url =
  "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql";

const res = await fetch(url);
if (!res.ok) {
  console.error(`fetch-linear-schema: HTTP ${res.status} from ${url}`);
  process.exit(1);
}
const text = await res.text();
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, text, "utf-8");
console.error(`fetch-linear-schema: wrote ${outPath} (${text.length} bytes)`);
