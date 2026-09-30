import { createHash } from "node:crypto";
import { Effect } from "effect";
import { canonicalJson } from "./canonical-json.js";

export type SubscriptionIdentity = {
  principal: string;
  url: string;
  name: string;
  arguments: Record<string, unknown>;
};

/** Deterministic `sub_<hex>` from principal + callback URL + event name + args. */
export function deriveSubscriptionId(identity: SubscriptionIdentity): string {
  const payload = canonicalJson({
    principal: identity.principal,
    url: identity.url,
    name: identity.name,
    arguments: identity.arguments ?? {},
  });
  const hex = createHash("sha256").update(payload).digest("hex").slice(0, 32);
  return `sub_${hex}`;
}

export function deriveSubscriptionIdEffect(
  identity: SubscriptionIdentity
): Effect.Effect<string> {
  return Effect.sync(() => deriveSubscriptionId(identity));
}
