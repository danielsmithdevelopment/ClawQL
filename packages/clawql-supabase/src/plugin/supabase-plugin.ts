/**
 * Supabase Auth ProviderPlugin — session verify + Checkout CPC handoff tools.
 * Opt-in via CLAWQL_ENABLE_SUPABASE=1 (and URL + JWT secret/JWKS).
 */

import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import { SupabaseAuthService } from "../auth/supabase-auth-service.js";
import {
  buildSupabaseCheckoutMetadataEffect,
  type SupabaseCheckoutPlan,
} from "../checkout/handoff.js";
import { supabasePluginEnabled } from "../config/supabase-config.js";
import { runSupabaseEffect } from "../effect/runtime.js";

export const SUPABASE_PLUGIN_ID = "clawql-supabase";

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const verifySchema = {
  accessToken: z
    .string()
    .describe("Supabase Auth access_token (JWT). Prefer Authorization bearer without storing it."),
};

const handoffSchema = {
  accessToken: z.string().describe("Supabase Auth access_token to verify before building metadata"),
  orgName: z.string().describe("Organization name for CPC provisionOrg"),
  plan: z.enum(["pro", "team"]).optional().describe("Checkout plan (default pro)"),
  ownerEmail: z
    .string()
    .optional()
    .describe("Override email when JWT email claim is missing"),
  billingMode: z
    .enum(["stripe_checkout", "hybrid"])
    .optional()
    .describe("CPC billingMode (default stripe_checkout)"),
};

export function createSupabasePlugin(env: NodeJS.ProcessEnv = process.env): ProviderPlugin {
  return defineRegisteringProviderPlugin({
    id: SUPABASE_PLUGIN_ID,
    version: "0.1.0",
    description:
      "Supabase Auth for managed clawql.com signup — verify sessions and build Stripe Checkout CPC metadata",
    skills: [
      {
        skillId: "supabase-managed-signup",
        name: "Supabase managed signup",
        description:
          "Human account signup via Supabase Auth, then Stripe Checkout → provisionOrg → ClawQL API key",
        content: `# Supabase managed signup

ClawQL is not an IdP. For managed clawql.com accounts:

1. Create/login the human in **Supabase Auth**.
2. Call \`supabase_verify_session\` with the access token (or use \`supabase_checkout_handoff\`).
3. Start Stripe Checkout with the returned CPC metadata (\`clawql_provision_org\`, \`clawql_supabase_user_id\`, …).
4. On \`checkout.session.completed\`, \`provisionOrg\` issues the ClawQL API key.

Do **not** mint ClawQL API keys from Supabase. Do **not** put MCP/WORM in Supabase.
`,
        applicability: "query-matched",
      },
    ],
    vaultSeed: [
      {
        title: "Supabase Auth provider",
        ontologyType: "clawql-provider",
        content:
          "clawql-supabase: human signup/login for managed offerings. Env: CLAWQL_ENABLE_SUPABASE, CLAWQL_SUPABASE_URL, CLAWQL_SUPABASE_JWT_SECRET or JWKS. CPC handoff key clawql_supabase_user_id.",
      },
    ],
    register: (api) =>
      Effect.gen(function* () {
        if (!supabasePluginEnabled(env)) {
          return;
        }
        yield* api.registerMcpTool({
          name: "supabase_verify_session",
          schema: verifySchema,
          handler: async (args) => {
            const accessToken = String((args as { accessToken?: string }).accessToken ?? "");
            try {
              const claims = await runSupabaseEffect(
                Effect.gen(function* () {
                  const auth = yield* SupabaseAuthService;
                  return yield* auth.verifyAccessToken(accessToken, env);
                })
              );
              return textResult({
                ok: true,
                sub: claims.sub,
                email: claims.email,
                role: claims.role,
                iss: claims.iss,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return textResult({ ok: false, error: message });
            }
          },
        });
        yield* api.registerMcpTool({
          name: "supabase_checkout_handoff",
          schema: handoffSchema,
          handler: async (args) => {
            const a = args as {
              accessToken?: string;
              orgName?: string;
              plan?: SupabaseCheckoutPlan;
              ownerEmail?: string;
              billingMode?: "stripe_checkout" | "hybrid";
            };
            try {
              const metadata = await runSupabaseEffect(
                Effect.gen(function* () {
                  const auth = yield* SupabaseAuthService;
                  const claims = yield* auth.verifyAccessToken(String(a.accessToken ?? ""), env);
                  return yield* buildSupabaseCheckoutMetadataEffect({
                    orgName: String(a.orgName ?? ""),
                    plan: a.plan === "team" ? "team" : "pro",
                    ownerEmail: a.ownerEmail,
                    billingMode: a.billingMode,
                    claims,
                  });
                })
              );
              return textResult({
                ok: true,
                metadata,
                checkoutHint:
                  "POST CPC /checkout/session with orgName/ownerEmail/plan, then merge metadata.clawql_supabase_user_id into session metadata (or pass via extended checkout API).",
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return textResult({ ok: false, error: message });
            }
          },
        });
      }),
  });
}
