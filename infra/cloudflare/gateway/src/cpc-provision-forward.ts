/**
 * Forward Checkout Session to Node CPC after D1 tenant upsert.
 * No-op when CLAWQL_CPC_PROVISION_URL is unset.
 */

import type { GatewayEnv } from "./env.js";

export type CpcProvisionForwardResult =
  | { forwarded: false; reason: string }
  | { forwarded: true; ok: boolean; status: number; bodyText: string };

/**
 * POST Checkout Session JSON to Node `attachProvisioningRoutes`
 * (`/payments/provision-org-from-checkout`).
 */
export async function forwardCheckoutSessionToCpc(
  env: GatewayEnv,
  session: Record<string, unknown>,
  options: { correlationId?: string; fetchImpl?: typeof fetch } = {}
): Promise<CpcProvisionForwardResult> {
  const url = env.CLAWQL_CPC_PROVISION_URL?.trim();
  if (!url) {
    return { forwarded: false, reason: "CLAWQL_CPC_PROVISION_URL unset" };
  }
  const token = env.CLAWQL_CPC_PROVISION_TOKEN?.trim();
  if (!token) {
    return { forwarded: false, reason: "CLAWQL_CPC_PROVISION_TOKEN unset" };
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session,
      correlationId: options.correlationId,
    }),
  });
  const bodyText = await res.text();
  return {
    forwarded: true,
    ok: res.ok,
    status: res.status,
    bodyText: bodyText.slice(0, 2000),
  };
}
