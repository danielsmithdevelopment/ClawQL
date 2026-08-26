/**
 * Bundled OpenAPI / GraphQL provider composition — catalog is always available;
 * nothing is loaded until opted in via instance `providers` or legacy env.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** Named packs from {@link BUNDLED_PROVIDER_GROUPS} plus explicit empty. */
export const CLAWQL_PROVIDER_PACKS = [
  "none",
  "default",
  "default-providers",
  "all-providers",
  "google",
  "aws",
  "atlassian",
] as const;

export type ClawqlProviderPack = (typeof CLAWQL_PROVIDER_PACKS)[number];

/**
 * Instance-level provider stack selection (same spirit as horizontal plugin toggles).
 *
 * - **`pack`**: named merge (`default`, `all-providers`, …) or **`none`**
 * - **`enabled`**: explicit bundled vendor / group ids (merged with pack when both set)
 *
 * Default when unset and no legacy `CLAWQL_PROVIDER` / `CLAWQL_BUNDLED_PROVIDERS`: **load nothing**.
 */
export const clawqlProvidersCompositionSchema = z
  .object({
    pack: z.string().min(1).optional(),
    enabled: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ClawqlProvidersComposition = z.infer<typeof clawqlProvidersCompositionSchema>;

function providersFromInstanceDocument(raw: unknown): ClawqlProvidersComposition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const root = raw as Record<string, unknown>;
  const specBody =
    root.spec && typeof root.spec === "object" && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : root;
  if (!("providers" in specBody) || specBody.providers === undefined) return undefined;
  return clawqlProvidersCompositionSchema.parse(specBody.providers);
}

/**
 * Read `providers` from `CLAWQL_INSTANCE_SPEC` / `CLAWQL_INSTANCE_SPEC_FILE`.
 * Returns `undefined` when the instance has no `providers` key (fall through to legacy env).
 */
export function readProvidersCompositionFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ClawqlProvidersComposition | undefined {
  const inline = env.CLAWQL_INSTANCE_SPEC?.trim();
  if (inline) {
    return providersFromInstanceDocument(JSON.parse(inline) as unknown);
  }
  const filePath = env.CLAWQL_INSTANCE_SPEC_FILE?.trim();
  if (!filePath) return undefined;
  const text = readFileSync(filePath, "utf8").trim();
  const parsed = text.startsWith("{")
    ? (JSON.parse(text) as unknown)
    : (parseYaml(text) as unknown);
  return providersFromInstanceDocument(parsed);
}

/** True when composition explicitly requests an empty provider stack. */
export function isEmptyProvidersComposition(c: ClawqlProvidersComposition): boolean {
  const pack = c.pack?.trim().toLowerCase();
  const enabled = (c.enabled ?? []).map((s) => s.trim()).filter(Boolean);
  if (enabled.length > 0) return false;
  if (!pack || pack === "none") return true;
  return false;
}
