/**
 * clawql-supabase — CPC / clawql.com middleware only (no MCP tools).
 * Session JWTs stay on the account host; agents never see them.
 */

import { defineProviderPlugin, type ProviderPlugin } from "clawql-core";

export const SUPABASE_PLUGIN_ID = "clawql-supabase";

export function createSupabasePlugin(_env: NodeJS.ProcessEnv = process.env): ProviderPlugin {
  return defineProviderPlugin({
    id: SUPABASE_PLUGIN_ID,
    version: "0.1.0",
    description:
      "Supabase Auth middleware for managed clawql.com signup — CPC Checkout handoff, no MCP surface",
    skills: [
      {
        skillId: "supabase-managed-signup",
        name: "Supabase managed signup",
        description:
          "Human account signup via Supabase Auth, then Stripe Checkout → provisionOrg → ClawQL API key",
        content: `# Supabase managed signup

ClawQL is not an IdP. For managed clawql.com accounts:

1. Create/login the human in **Supabase Auth** (browser / clawql.com).
2. POST CPC \`/checkout/session\` with \`Authorization: Bearer <supabase access token>\`. The server verifies the JWT and derives the ClawQL user — never send a client-supplied user id, and never pass the session JWT through MCP.
3. Stripe Checkout metadata carries the ClawQL user linkage.
4. On signed \`checkout.session.completed\`, \`provisionOrg\` issues the ClawQL API key.

Do **not** mint ClawQL API keys from Supabase. Do **not** put MCP/WORM in Supabase.
Do **not** expose session verification or checkout as MCP tools — agents hold capabilities, never credentials.
`,
        applicability: "query-matched",
      },
    ],
    vaultSeed: [
      {
        title: "Supabase Auth provider",
        ontologyType: "clawql-provider",
        content:
          "clawql-supabase: human signup/login middleware for managed offerings (not MCP). Env: CLAWQL_ENABLE_SUPABASE, CLAWQL_SUPABASE_URL, CLAWQL_SUPABASE_JWKS_URL or CLAWQL_SUPABASE_JWT_SECRET. No agent-facing MCP tools.",
      },
    ],
  });
}
