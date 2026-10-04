/**
 * clawql-supabase — CPC / clawql.com middleware only (no MCP tools).
 * Session JWTs stay on the account host; agents never see them.
 */

import { defineProviderPlugin, type ProviderPlugin } from "clawql-core";
import { supabasePluginEnabled } from "../config/supabase-config.js";

export const SUPABASE_PLUGIN_ID = "clawql-supabase";

export function createSupabasePlugin(env: NodeJS.ProcessEnv = process.env): ProviderPlugin {
  const enabled = supabasePluginEnabled(env);
  return defineProviderPlugin({
    id: SUPABASE_PLUGIN_ID,
    version: "0.1.0",
    description:
      "Supabase Auth middleware for managed clawql.com signup — CPC Checkout handoff, no MCP surface",
    skills: enabled
      ? [
          {
            skillId: "supabase-managed-signup",
            name: "Supabase managed signup",
            description:
              "Operator runbook: human account signup via Supabase Auth, then Stripe Checkout → provisionOrg → ClawQL API key",
            content: `# Supabase managed signup (operator)

ClawQL is not an IdP. For managed clawql.com accounts:

1. Create/login the human in Supabase Auth (browser / account host).
2. POST CPC \`/checkout/session\` with \`Authorization: Bearer <supabase access token>\`. The server verifies the JWT (cached JWKS) and derives the ClawQL user id — never send a client-supplied user id.
3. Stripe Checkout metadata carries the internal ClawQL user id plus a linked identity subject.
4. On signed \`checkout.session.completed\`, \`provisionOrg\` issues the ClawQL API key (idempotent on webhook retry).

Account deletion is a resumable job (keys, org, Stripe, vault, then Supabase). Require a recent sign-in. Write \`ACCOUNT_DELETED\` only after every step completes.

Do **not** mint ClawQL API keys from Supabase. Do **not** put MCP/WORM in Supabase.
Do **not** expose session verification or checkout as MCP tools — agents hold capabilities, never credentials.
`,
            applicability: "query-matched",
            audience: "operator",
          },
        ]
      : [],
    vaultSeed: enabled
      ? [
          {
            title: "Supabase Auth provider",
            ontologyType: "clawql-provider",
            content:
              "clawql-supabase: human signup/login middleware for managed offerings, not an MCP surface and not an IdP. Humans authenticate at the account host. ClawQL stores an internal user id with a linked identity. Agents hold capabilities, never session tokens. Operator runbooks live in the plugin skill, not in the agent catalog.",
          },
        ]
      : [],
  });
}
