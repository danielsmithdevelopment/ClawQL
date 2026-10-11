/**
 * Product console surface: one TypeScript + shadcn app, two deployments.
 * Marketing (apps/www) stays Tailwind Plus. Do not adopt Catalyst here.
 *
 * @see docs/adr/0012-console-typescript-shadcn.md
 */

export const CONSOLE_UI_KIT = "shadcn" as const;

export type ConsoleSurface = "self-hosted" | "managed";

export function readConsoleSurface(env: NodeJS.ProcessEnv = process.env): ConsoleSurface {
  const raw = (env.CLAWQL_CONSOLE_SURFACE ?? env.NEXT_PUBLIC_CLAWQL_CONSOLE_SURFACE ?? "")
    .trim()
    .toLowerCase();
  if (raw === "managed" || raw === "cloud") return "managed";
  return "self-hosted";
}

export function isManagedConsole(env: NodeJS.ProcessEnv = process.env): boolean {
  return readConsoleSurface(env) === "managed";
}
