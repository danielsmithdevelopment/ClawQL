/**
 * Trusted module: mint IssuerAuthorized for API key issuance.
 */

import { defineProof, type Named, type Proof, type OrgId, type PrincipalId } from "clawql-gdp";
import { Effect } from "effect";

const IssuerAuthorizedProver = defineProof("IssuerAuthorized");

export interface IssuerAuthorized<I, O> extends Proof<"IssuerAuthorized", [I, O]> {
  /** Nominal brand for distinct proof kinds; never set at runtime. */
  readonly __proofBrand?: "IssuerAuthorized";
}

export type IssuerAuthorizedEvidence = {
  readonly issuerPrincipalId: string;
  readonly orgId: string;
  /** Billing-admin (or equivalent) tenant ids allowed to issue keys for the org. */
  readonly billingAdminTenantIds: readonly string[];
};

export function issuerAuthorizedEffect<I, O>(
  issuer: Named<I, PrincipalId>,
  org: Named<O, OrgId>,
  evidence: IssuerAuthorizedEvidence
): Effect.Effect<IssuerAuthorized<I, O> | null> {
  return Effect.sync(() => {
    if (issuer.value !== evidence.issuerPrincipalId.trim()) return null;
    if (org.value !== evidence.orgId.trim()) return null;
    const allowed = evidence.billingAdminTenantIds.map((t) => t.trim());
    if (!allowed.includes(issuer.value)) return null;
    return IssuerAuthorizedProver.prove(issuer, org) as IssuerAuthorized<I, O>;
  });
}
